// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {StableSwap} from "./StableSwap.sol";
import {OrderBook} from "./OrderBook.sol";
import {TickBitmap} from "./libraries/TickBitmap.sol";

/// @title Quoter
/// @notice View-only. Computes the split of an order between the CLOB and the AMM that
///         maximises the taker's output, and hands it to Router.swapExactIn.
///
/// @dev Why this is correct, not a heuristic:
///        - Output from the book as a function of size is CONCAVE: levels are consumed
///          best-price-first, so each additional unit is filled at a weakly worse price.
///        - Output from a StableSwap pool as a function of size is CONCAVE: that is the
///          defining property of the invariant.
///        - The sum of two concave functions is concave, and a concave function on an
///          interval is unimodal.
///      Therefore TERNARY SEARCH over `bookIn ∈ [0, amountIn]` converges to the global
///      optimum. No greedy approximation, no off-chain solver to trust.
///
///      This is a view function. It costs the caller nothing, so it buys precision with
///      iterations rather than trying to be gas-clever.
contract Quoter {
    uint256 private constant PRECISION = 1e18;
    uint256 private constant TERNARY_ITERS = 90;

    StableSwap public immutable pool;
    OrderBook public immutable book;

    constructor(address pool_, address book_) {
        pool = StableSwap(pool_);
        book = OrderBook(book_);
    }

    struct Quote {
        uint256 bookIn;
        uint256 ammIn;
        uint256 expectedOut;
        uint256 bookOut;
        uint256 ammOut;
        uint32 limitTick;
    }

    /// @notice Best achievable split for `amountIn`.
    /// @param zeroForOne True = sell BASE for QUOTE (hits bids). False = sell QUOTE for BASE (hits asks).
    /// @param maxLevels How many price levels to consider. 16 is plenty for a stable pair.
    function quote(bool zeroForOne, uint256 amountIn, uint16 maxLevels) external view returns (Quote memory q) {
        if (amountIn == 0) return q;

        (uint256[] memory prices, uint256[] memory capsIn, uint32 worstTick) = _snapshot(zeroForOne, maxLevels);

        uint256 bookCapacity;
        for (uint256 i = 0; i < capsIn.length; ++i) {
            bookCapacity += capsIn[i];
        }

        uint256 hi = bookCapacity < amountIn ? bookCapacity : amountIn;
        uint256 lo = 0;

        // Ternary search for the maximum of f(bookIn) = bookOut(bookIn) + ammOut(amountIn - bookIn).
        for (uint256 i = 0; i < TERNARY_ITERS && hi > lo + 1; ++i) {
            uint256 m1 = lo + (hi - lo) / 3;
            uint256 m2 = hi - (hi - lo) / 3;
            if (_total(zeroForOne, amountIn, m1, prices, capsIn) < _total(zeroForOne, amountIn, m2, prices, capsIn)) {
                lo = m1 + 1;
            } else {
                hi = m2 - 1 < m2 ? m2 - 1 : m2;
                if (hi < lo) hi = lo;
            }
        }

        // Evaluate the survivors plus the two endpoints, and take the best.
        uint256 bestIn;
        uint256 bestOut;
        uint256[4] memory candidates = [lo, hi, uint256(0), bookCapacity < amountIn ? bookCapacity : amountIn];
        for (uint256 i = 0; i < 4; ++i) {
            uint256 c = candidates[i];
            if (c > amountIn) continue;
            uint256 t = _total(zeroForOne, amountIn, c, prices, capsIn);
            if (t > bestOut) {
                bestOut = t;
                bestIn = c;
            }
        }

        (uint256 bOut, uint256 bSpent) = _bookOut(bestIn, prices, capsIn);
        uint256 aIn = amountIn - bSpent;

        q.bookIn = bSpent;
        q.ammIn = aIn;
        q.bookOut = bOut;
        q.ammOut = aIn > 0 ? pool.getDy(zeroForOne, aIn) : 0;
        q.expectedOut = q.bookOut + q.ammOut;
        q.limitTick = worstTick;
    }

    // ---------------------------------------------------------------------

    function _total(
        bool zeroForOne,
        uint256 amountIn,
        uint256 bookIn,
        uint256[] memory prices,
        uint256[] memory capsIn
    ) private view returns (uint256) {
        (uint256 bOut, uint256 bSpent) = _bookOut(bookIn, prices, capsIn);
        uint256 aIn = amountIn - bSpent;
        uint256 aOut = aIn > 0 ? pool.getDy(zeroForOne, aIn) : 0;
        return bOut + aOut;
    }

    /// @dev Walks the snapshotted levels in memory. Pure arithmetic, no storage.
    function _bookOut(uint256 amountIn, uint256[] memory prices, uint256[] memory capsIn)
        private
        view
        returns (uint256 out, uint256 spent)
    {
        uint256 remaining = amountIn;
        for (uint256 i = 0; i < prices.length && remaining > 0; ++i) {
            uint256 take = remaining < capsIn[i] ? remaining : capsIn[i];
            if (take == 0) continue;

            // prices[i] is stored as "output units per input unit", 1e18 scaled, so both
            // directions collapse to the same multiply here.
            out += (take * prices[i]) / PRECISION;
            spent += take;
            remaining -= take;
        }
        // Taker fee is charged on the gross output.
        out -= (out * book.takerFeeBps()) / 10_000;
    }

    /// @dev Reads up to `maxLevels` price levels off the book into memory.
    ///      Returns capacities denominated in the taker's INPUT token, and prices as
    ///      output-per-input, so downstream maths is direction-agnostic.
    function _snapshot(bool zeroForOne, uint16 maxLevels)
        private
        view
        returns (uint256[] memory prices, uint256[] memory capsIn, uint32 worstTick)
    {
        uint256[] memory p = new uint256[](maxLevels);
        uint256[] memory c = new uint256[](maxLevels);
        uint256 n;

        if (zeroForOne) {
            // Selling base into bids: walk from best (highest) bid downward.
            uint32 tick = book.bestBid();
            while (tick != 0 && n < maxLevels) {
                uint128 depthBase = book.levelDepth(true, tick);
                if (depthBase > 0) {
                    p[n] = book.priceOf(tick); // quote out per base in
                    c[n] = depthBase; // capacity in base = input token
                    worstTick = tick;
                    unchecked {
                        ++n;
                    }
                }
                tick = book.nextBidBelow(tick);
            }
        } else {
            // Buying base from asks: walk from best (lowest) ask upward.
            uint32 tick = book.bestAsk();
            while (tick != 0 && n < maxLevels) {
                uint128 depthBase = book.levelDepth(false, tick);
                if (depthBase > 0) {
                    uint256 price = book.priceOf(tick);
                    // base out per quote in = 1e18 / price
                    p[n] = (PRECISION * PRECISION) / price;
                    // capacity in quote = depthBase * price
                    c[n] = (uint256(depthBase) * price) / PRECISION;
                    worstTick = tick;
                    unchecked {
                        ++n;
                    }
                }
                tick = book.nextAskAbove(tick);
            }
        }

        prices = new uint256[](n);
        capsIn = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            prices[i] = p[i];
            capsIn[i] = c[i];
        }

        if (worstTick == 0) {
            worstTick = zeroForOne ? 1 : TickBitmap.MAX_TICK;
        }
    }
}
