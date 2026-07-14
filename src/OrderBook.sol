// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {TickBitmap} from "./libraries/TickBitmap.sol";
import {StableSwap} from "./StableSwap.sol";

/// @title OrderBook
/// @notice A real on-chain central limit order book for a stablecoin FX pair.
///
/// @dev This is only viable because Arc gives us sub-second deterministic finality and
///      a flat ~$0.01 USDC gas cost. On a chain with volatile gas and 12s blocks, this
///      contract would be unusable — which is precisely why every other DEX on Arc is
///      an AMM, and why this one isn't.
///
///      Security posture:
///      - NO ADMIN. No owner, no pause, no upgrade, no rescue. Nothing to compromise.
///      - PULL PAYMENTS. Matching never calls out to a maker. Fills credit an internal
///        `claimable` balance which the maker withdraws in a separate transaction. The
///        matching loop therefore contains ZERO external calls, and reentrancy against
///        it is not merely guarded, it is structurally impossible.
///      - POST-ONLY MAKERS. A limit order that would cross the spread reverts. Makers
///        make, takers take, and the two code paths never interleave.
///      - Taker fees are not skimmed by a treasury. They accrue to `pendingFee*` and are
///        donated to the StableSwap LPs by anyone calling flushFees(). The book pays the
///        pool that backstops it.
///
///      Conventions:
///      - coin0 is the BASE (e.g. USDC), coin1 is the QUOTE (e.g. EURC).
///      - price(tick) = tick * TICK_SIZE, expressed as quote-per-base in 1e18 fixed point.
///      - Order size is always denominated in BASE, on both sides of the book.
contract OrderBook is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using TickBitmap for mapping(uint16 => uint256);

    uint256 public constant TICK_SIZE = 1e13; // 0.00001 quote per base
    uint256 public constant FEE_DENOM = 10_000;
    uint256 private constant PRECISION = 1e18;

    struct Order {
        address maker; //  160
        uint32 tick; //     32
        bool isBid; //       8
        bool active; //      8   => slot 0
        uint128 baseAmount; //
        uint128 baseFilled; //   => slot 1
        uint128 quoteEscrow; // remaining escrowed quote (bids only)
        uint64 prev;
        uint64 next; //          => slot 2
    }

    struct Level {
        uint64 head;
        uint64 tail;
        uint128 totalBase; //    => slot 0
    }

    IERC20 public immutable base; // coin0
    IERC20 public immutable quote; // coin1
    StableSwap public immutable pool;
    uint256 public immutable takerFeeBps;

    mapping(uint64 => Order) public orders;
    uint64 public nextOrderId = 1;

    mapping(uint32 => Level) public bidLevels;
    mapping(uint32 => Level) public askLevels;

    mapping(uint16 => uint256) private bidBitmap;
    mapping(uint16 => uint256) private askBitmap;

    /// @notice Highest bid tick with liquidity, 0 if the bid side is empty.
    uint32 public bestBid;
    /// @notice Lowest ask tick with liquidity, 0 if the ask side is empty.
    uint32 public bestAsk;

    /// @notice Maker proceeds and cancelled escrow, withdrawable at will.
    mapping(address => uint256) public claimableBase;
    mapping(address => uint256) public claimableQuote;

    uint256 public pendingFeeBase;
    uint256 public pendingFeeQuote;

    error BadParams();
    error BadTick();
    error ZeroAmount();
    error WouldCross();
    error NotMaker();
    error NotActive();
    error Slippage();
    error NothingFilled();
    error NothingToClaim();

    event OrderPlaced(
        uint64 indexed id, address indexed maker, bool isBid, uint32 tick, uint128 baseAmount, uint128 quoteEscrow
    );
    event OrderFilled(uint64 indexed id, address indexed maker, address indexed taker, uint128 baseFill, uint256 quoteFill);
    event OrderCancelled(uint64 indexed id, address indexed maker, uint128 baseRemaining);
    event TakerSwap(address indexed taker, bool sellingBase, uint256 amountIn, uint256 amountOut, uint256 fee);
    event Claimed(address indexed who, uint256 baseAmount, uint256 quoteAmount);
    event FeesFlushed(uint256 baseAmount, uint256 quoteAmount);

    constructor(address pool_, uint256 takerFeeBps_) {
        if (pool_ == address(0)) revert BadParams();
        if (takerFeeBps_ > 50) revert BadParams(); // hard cap 0.5%

        pool = StableSwap(pool_);
        base = IERC20(address(StableSwap(pool_).coin0()));
        quote = IERC20(address(StableSwap(pool_).coin1()));
        takerFeeBps = takerFeeBps_;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function priceOf(uint32 tick) public pure returns (uint256) {
        return uint256(tick) * TICK_SIZE;
    }

    /// @notice Base liquidity resting at a given price level.
    function levelDepth(bool isBid, uint32 tick) external view returns (uint128) {
        return isBid ? bidLevels[tick].totalBase : askLevels[tick].totalBase;
    }

    /// @notice Next initialised bid tick strictly below `tick`. 0 if none.
    function nextBidBelow(uint32 tick) external view returns (uint32) {
        if (tick <= 1) return 0;
        return bidBitmap.highestAtOrBelow(tick - 1);
    }

    /// @notice Next initialised ask tick strictly above `tick`. 0 if none.
    function nextAskAbove(uint32 tick) external view returns (uint32) {
        if (tick >= TickBitmap.MAX_TICK) return 0;
        return askBitmap.lowestAtOrAbove(tick + 1);
    }

    // ---------------------------------------------------------------------
    // Maker side — post only
    // ---------------------------------------------------------------------

    /// @notice Rest a limit order on the book. Reverts if it would cross the spread.
    /// @param isBid True to buy base with quote; false to sell base for quote.
    /// @param tick Price level. price = tick * TICK_SIZE (quote per base, 1e18).
    /// @param baseAmount Size, always denominated in BASE.
    function placeOrder(bool isBid, uint32 tick, uint128 baseAmount) external nonReentrant returns (uint64 id) {
        if (tick == 0 || tick > TickBitmap.MAX_TICK) revert BadTick();
        if (baseAmount == 0) revert ZeroAmount();

        uint128 quoteEscrow = 0;

        if (isBid) {
            // A bid at or above the best ask would cross. Takers use the swap path.
            if (bestAsk != 0 && tick >= bestAsk) revert WouldCross();
            // Round the escrow UP so the maker can always honour every fill.
            uint256 esc = (uint256(baseAmount) * priceOf(tick) + PRECISION - 1) / PRECISION;
            if (esc == 0) revert ZeroAmount();
            if (esc > type(uint128).max) revert BadParams();
            quoteEscrow = uint128(esc);
        } else {
            if (bestBid != 0 && tick <= bestBid) revert WouldCross();
        }

        id = nextOrderId++;
        orders[id] = Order({
            maker: msg.sender,
            tick: tick,
            isBid: isBid,
            active: true,
            baseAmount: baseAmount,
            baseFilled: 0,
            quoteEscrow: quoteEscrow,
            prev: 0,
            next: 0
        });

        _pushToLevel(isBid, tick, id, baseAmount);

        if (isBid) {
            if (tick > bestBid) bestBid = tick;
            quote.safeTransferFrom(msg.sender, address(this), quoteEscrow);
        } else {
            if (bestAsk == 0 || tick < bestAsk) bestAsk = tick;
            base.safeTransferFrom(msg.sender, address(this), baseAmount);
        }

        emit OrderPlaced(id, msg.sender, isBid, tick, baseAmount, quoteEscrow);
    }

    function cancelOrder(uint64 id) external nonReentrant {
        Order storage o = orders[id];
        if (!o.active) revert NotActive();
        if (o.maker != msg.sender) revert NotMaker();

        uint128 remaining = o.baseAmount - o.baseFilled;
        bool isBid = o.isBid;
        uint32 tick = o.tick;
        uint128 refundQuote = o.quoteEscrow;

        o.active = false;
        _removeFromLevel(isBid, tick, id, remaining);
        _refreshBestAfterRemoval(isBid, tick);

        emit OrderCancelled(id, msg.sender, remaining);

        if (isBid) {
            o.quoteEscrow = 0;
            if (refundQuote > 0) quote.safeTransfer(msg.sender, refundQuote);
        } else {
            if (remaining > 0) base.safeTransfer(msg.sender, remaining);
        }
    }

    // ---------------------------------------------------------------------
    // Taker side
    // ---------------------------------------------------------------------

    /// @notice Sell BASE into resting bids, best price first.
    /// @param baseIn Maximum base to sell. Unfilled remainder is simply not pulled.
    /// @param minQuoteOut Slippage floor on the quote actually received.
    /// @param minTick Worst (lowest) price the taker will accept.
    /// @param maxOrders Gas bound on how many resting orders may be consumed.
    /// @param to Recipient of the quote proceeds.
    /// @return baseSpent Base actually pulled from the caller.
    /// @return quoteOut Quote actually delivered to `to`, net of fee.
    function sellBase(uint128 baseIn, uint256 minQuoteOut, uint32 minTick, uint16 maxOrders, address to)
        external
        nonReentrant
        returns (uint128 baseSpent, uint256 quoteOut)
    {
        if (baseIn == 0) revert ZeroAmount();
        if (to == address(0)) revert BadParams();
        if (minTick == 0) minTick = 1;

        uint128 remaining = baseIn;
        uint256 grossQuote;
        uint32 tick = bestBid;
        uint16 filled;

        // ---- matching loop: pure storage, zero external calls ----
        while (tick >= minTick && tick != 0 && remaining > 0 && filled < maxOrders) {
            Level storage lvl = bidLevels[tick];
            uint256 price = priceOf(tick);

            while (lvl.head != 0 && remaining > 0 && filled < maxOrders) {
                uint64 id = lvl.head;
                Order storage o = orders[id];

                uint128 avail = o.baseAmount - o.baseFilled;
                uint128 fill = remaining < avail ? remaining : avail;

                uint256 quoteFill = (uint256(fill) * price) / PRECISION;
                if (quoteFill > o.quoteEscrow) quoteFill = o.quoteEscrow; // defensive; escrow was rounded up

                o.baseFilled += fill;
                o.quoteEscrow -= uint128(quoteFill);
                lvl.totalBase -= fill;

                // Bidder is buying base: credit them the base, release their escrowed quote.
                claimableBase[o.maker] += fill;
                grossQuote += quoteFill;
                remaining -= fill;

                emit OrderFilled(id, o.maker, msg.sender, fill, quoteFill);

                if (o.baseFilled == o.baseAmount) {
                    // Fully filled. Any escrow dust from rounding stays with the maker.
                    if (o.quoteEscrow > 0) {
                        claimableQuote[o.maker] += o.quoteEscrow;
                        o.quoteEscrow = 0;
                    }
                    o.active = false;
                    _popHead(lvl, id);
                    unchecked {
                        ++filled;
                    }
                } else {
                    unchecked {
                        ++filled;
                    }
                    break; // order partially filled => taker is exhausted
                }
            }

            if (lvl.totalBase == 0 && lvl.head == 0) {
                bidBitmap.flip(tick);
            }
            if (remaining == 0 || filled >= maxOrders) break;
            if (tick == 1) {
                tick = 0;
                break;
            }
            tick = bidBitmap.highestAtOrBelow(tick - 1);
        }
        // ---- end matching loop ----

        bestBid = bidBitmap.highestAtOrBelow(bestBid);

        baseSpent = baseIn - remaining;
        if (baseSpent == 0) revert NothingFilled();

        uint256 fee = (grossQuote * takerFeeBps) / FEE_DENOM;
        quoteOut = grossQuote - fee;
        if (quoteOut < minQuoteOut) revert Slippage();

        pendingFeeQuote += fee;

        base.safeTransferFrom(msg.sender, address(this), baseSpent);
        quote.safeTransfer(to, quoteOut);

        emit TakerSwap(msg.sender, true, baseSpent, quoteOut, fee);
    }

    /// @notice Buy BASE from resting asks, best price first.
    /// @param quoteIn Maximum quote to spend. Unspent remainder is not pulled.
    /// @param maxTick Worst (highest) price the taker will accept.
    function buyBase(uint256 quoteIn, uint256 minBaseOut, uint32 maxTick, uint16 maxOrders, address to)
        external
        nonReentrant
        returns (uint256 quoteSpent, uint256 baseOut)
    {
        if (quoteIn == 0) revert ZeroAmount();
        if (to == address(0)) revert BadParams();
        if (maxTick == 0 || maxTick > TickBitmap.MAX_TICK) maxTick = TickBitmap.MAX_TICK;

        uint256 remaining = quoteIn;
        uint256 grossBase;
        uint32 tick = bestAsk;
        uint16 filled;

        while (tick != 0 && tick <= maxTick && remaining > 0 && filled < maxOrders) {
            Level storage lvl = askLevels[tick];
            uint256 price = priceOf(tick);

            while (lvl.head != 0 && remaining > 0 && filled < maxOrders) {
                uint64 id = lvl.head;
                Order storage o = orders[id];

                uint128 avail = o.baseAmount - o.baseFilled;

                // How much base this taker can still afford at this price.
                uint256 affordable = (remaining * PRECISION) / price;
                if (affordable == 0) {
                    remaining = 0; // dust: cannot buy a single unit at this level
                    break;
                }

                uint128 fill = affordable < avail ? uint128(affordable) : avail;
                uint256 cost = (uint256(fill) * price) / PRECISION;
                if (cost > remaining) cost = remaining; // floor guard

                o.baseFilled += fill;
                lvl.totalBase -= fill;

                // Asker is selling base: credit them the quote proceeds.
                claimableQuote[o.maker] += cost;
                grossBase += fill;
                remaining -= cost;

                emit OrderFilled(id, o.maker, msg.sender, fill, cost);

                if (o.baseFilled == o.baseAmount) {
                    o.active = false;
                    _popHead(lvl, id);
                    unchecked {
                        ++filled;
                    }
                } else {
                    unchecked {
                        ++filled;
                    }
                    break;
                }
            }

            if (lvl.totalBase == 0 && lvl.head == 0) {
                askBitmap.flip(tick);
            }
            if (remaining == 0 || filled >= maxOrders) break;
            if (tick >= TickBitmap.MAX_TICK) {
                tick = 0;
                break;
            }
            tick = askBitmap.lowestAtOrAbove(tick + 1);
        }

        bestAsk = bestAsk == 0 ? 0 : askBitmap.lowestAtOrAbove(bestAsk);

        quoteSpent = quoteIn - remaining;
        if (grossBase == 0) revert NothingFilled();

        uint256 fee = (grossBase * takerFeeBps) / FEE_DENOM;
        baseOut = grossBase - fee;
        if (baseOut < minBaseOut) revert Slippage();

        pendingFeeBase += fee;

        quote.safeTransferFrom(msg.sender, address(this), quoteSpent);
        base.safeTransfer(to, baseOut);

        emit TakerSwap(msg.sender, false, quoteSpent, baseOut, fee);
    }

    // ---------------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------------

    /// @notice Withdraw everything owed to the caller from fills and cancellations.
    function claim() external nonReentrant returns (uint256 b, uint256 q) {
        b = claimableBase[msg.sender];
        q = claimableQuote[msg.sender];
        if (b == 0 && q == 0) revert NothingToClaim();

        claimableBase[msg.sender] = 0;
        claimableQuote[msg.sender] = 0;

        if (b > 0) base.safeTransfer(msg.sender, b);
        if (q > 0) quote.safeTransfer(msg.sender, q);

        emit Claimed(msg.sender, b, q);
    }

    /// @notice Push accumulated taker fees into the StableSwap pool, raising its virtual
    ///         price. Permissionless — the only thing a caller can achieve is paying LPs.
    function flushFees() external nonReentrant {
        uint256 b = pendingFeeBase;
        uint256 q = pendingFeeQuote;
        if (b == 0 && q == 0) revert NothingToClaim();

        pendingFeeBase = 0;
        pendingFeeQuote = 0;

        if (b > 0) base.forceApprove(address(pool), b);
        if (q > 0) quote.forceApprove(address(pool), q);
        pool.donate(b, q);

        emit FeesFlushed(b, q);
    }

    // ---------------------------------------------------------------------
    // Internal list plumbing
    // ---------------------------------------------------------------------

    function _pushToLevel(bool isBid, uint32 tick, uint64 id, uint128 baseAmount) private {
        Level storage lvl = isBid ? bidLevels[tick] : askLevels[tick];

        if (lvl.head == 0) {
            lvl.head = id;
            lvl.tail = id;
            if (isBid) bidBitmap.flip(tick);
            else askBitmap.flip(tick);
        } else {
            uint64 tail = lvl.tail;
            orders[tail].next = id;
            orders[id].prev = tail;
            lvl.tail = id;
        }
        lvl.totalBase += baseAmount;
    }

    function _popHead(Level storage lvl, uint64 id) private {
        uint64 nxt = orders[id].next;
        lvl.head = nxt;
        if (nxt == 0) lvl.tail = 0;
        else orders[nxt].prev = 0;
        orders[id].next = 0;
    }

    function _removeFromLevel(bool isBid, uint32 tick, uint64 id, uint128 remainingBase) private {
        Level storage lvl = isBid ? bidLevels[tick] : askLevels[tick];
        Order storage o = orders[id];

        uint64 p = o.prev;
        uint64 n = o.next;

        if (p != 0) orders[p].next = n;
        else lvl.head = n;

        if (n != 0) orders[n].prev = p;
        else lvl.tail = p;

        o.prev = 0;
        o.next = 0;
        lvl.totalBase -= remainingBase;

        if (lvl.head == 0) {
            if (isBid) bidBitmap.flip(tick);
            else askBitmap.flip(tick);
        }
    }

    function _refreshBestAfterRemoval(bool isBid, uint32 tick) private {
        if (isBid) {
            if (tick == bestBid) bestBid = bidBitmap.highestAtOrBelow(tick);
        } else {
            if (tick == bestAsk) bestAsk = askBitmap.lowestAtOrAbove(tick);
        }
    }
}
