// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {Router} from "./Router.sol";
import {StableSwap} from "./StableSwap.sol";

/// @title TwapExecutor
/// @notice Splits a large FX order into timed slices. The treasury primitive a stablecoin
///         chain is supposed to have and currently doesn't.
///
/// @dev Cranking is PERMISSIONLESS. Anyone may execute a due slice and collect
///      KEEPER_FEE_BPS of it. That is what makes the thing actually run without us
///      operating privileged infrastructure.
///
///      The keeper chooses the book/AMM split, which sounds dangerous and isn't:
///      `minPriceX18` is set by the ORDER OWNER at creation and enforced on every slice,
///      denominated per unit of input. A keeper who routes badly simply reverts and earns
///      nothing. They cannot make the owner accept a bad fill; the worst they can do is
///      decline to work.
///
///      NO ADMIN. Owners can always cancel and withdraw. Nothing else can move funds.
contract TwapExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant KEEPER_FEE_BPS = 5; // 0.05% of each slice
    uint256 public constant FEE_DENOM = 10_000;
    uint256 private constant PRECISION = 1e18;
    uint32 public constant MIN_INTERVAL = 1; // Arc blocks are sub-second; 1s is a real floor

    struct Twap {
        address owner; //      160
        bool zeroForOne; //      8
        bool active; //          8
        uint32 interval; //     32
        uint32 slicesLeft; //   32  => slot 0 (240 bits)
        uint128 sliceAmount;
        uint128 remaining; //       => slot 1
        uint64 nextExecAt;
        uint192 minPriceX18; //     => slot 2  (output per unit input, 1e18)
    }

    Router public immutable router;
    IERC20 public immutable base;
    IERC20 public immutable quote;

    mapping(uint256 => Twap) public twaps;
    uint256 public nextTwapId = 1;

    error BadParams();
    error NotOwner();
    error NotActive();
    error NotDue();

    event TwapCreated(
        uint256 indexed id, address indexed owner, bool zeroForOne, uint256 total, uint32 slices, uint32 interval
    );
    event SliceExecuted(
        uint256 indexed id, address indexed keeper, uint256 amountIn, uint256 amountOut, uint256 keeperFee
    );
    event TwapCancelled(uint256 indexed id, uint256 refunded);

    constructor(address router_) {
        if (router_ == address(0)) revert BadParams();
        router = Router(router_);
        StableSwap p = Router(router_).pool();
        base = IERC20(address(p.coin0()));
        quote = IERC20(address(p.coin1()));
    }

    /// @param totalAmount Total input to work through.
    /// @param slices Number of slices. The final slice absorbs any rounding remainder.
    /// @param interval Seconds between slices.
    /// @param minPriceX18 Floor on output per unit of input, 1e18-scaled. Enforced per slice.
    function createTwap(bool zeroForOne, uint128 totalAmount, uint32 slices, uint32 interval, uint192 minPriceX18)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (totalAmount == 0 || slices == 0 || interval < MIN_INTERVAL) revert BadParams();
        if (minPriceX18 == 0) revert BadParams();

        uint128 sliceAmount = totalAmount / slices;
        if (sliceAmount == 0) revert BadParams();

        id = nextTwapId++;
        twaps[id] = Twap({
            owner: msg.sender,
            zeroForOne: zeroForOne,
            active: true,
            interval: interval,
            slicesLeft: slices,
            sliceAmount: sliceAmount,
            remaining: totalAmount,
            nextExecAt: uint64(block.timestamp),
            minPriceX18: minPriceX18
        });

        IERC20 tokenIn = zeroForOne ? base : quote;
        tokenIn.safeTransferFrom(msg.sender, address(this), totalAmount);

        emit TwapCreated(id, msg.sender, zeroForOne, totalAmount, slices, interval);
    }

    /// @notice Execute one due slice. Anyone may call. Caller keeps KEEPER_FEE_BPS.
    function crank(uint256 id, uint256 bookAmountIn, uint32 limitTick, uint16 maxOrders)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        Twap storage t = twaps[id];
        if (!t.active) revert NotActive();
        if (block.timestamp < t.nextExecAt) revert NotDue();

        // Last slice mops up the rounding dust.
        uint128 slice = t.slicesLeft == 1 || t.remaining < t.sliceAmount ? t.remaining : t.sliceAmount;

        uint256 keeperFee = (uint256(slice) * KEEPER_FEE_BPS) / FEE_DENOM;
        uint256 swapIn = slice - keeperFee;
        if (swapIn == 0) revert BadParams();

        if (bookAmountIn > swapIn) bookAmountIn = swapIn;
        uint256 minOut = (swapIn * uint256(t.minPriceX18)) / PRECISION;

        // Effects first.
        t.remaining -= slice;
        t.slicesLeft = t.slicesLeft > 0 ? t.slicesLeft - 1 : 0;
        t.nextExecAt = uint64(block.timestamp) + t.interval;
        if (t.remaining == 0 || t.slicesLeft == 0) t.active = false;

        bool z = t.zeroForOne;
        address owner_ = t.owner;
        IERC20 tokenIn = z ? base : quote;

        tokenIn.forceApprove(address(router), swapIn);
        amountOut = router.swapExactIn(
            z, swapIn, bookAmountIn, minOut, limitTick, maxOrders, block.timestamp, owner_
        );
        tokenIn.forceApprove(address(router), 0);

        if (keeperFee > 0) tokenIn.safeTransfer(msg.sender, keeperFee);

        emit SliceExecuted(id, msg.sender, swapIn, amountOut, keeperFee);
    }

    function cancelTwap(uint256 id) external nonReentrant returns (uint256 refunded) {
        Twap storage t = twaps[id];
        if (!t.active) revert NotActive();
        if (t.owner != msg.sender) revert NotOwner();

        refunded = t.remaining;
        t.remaining = 0;
        t.active = false;

        IERC20 tokenIn = t.zeroForOne ? base : quote;
        if (refunded > 0) tokenIn.safeTransfer(msg.sender, refunded);

        emit TwapCancelled(id, refunded);
    }
}
