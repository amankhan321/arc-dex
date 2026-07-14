// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title StableMath
/// @notice Curve-style StableSwap invariant for a 2-coin pool.
/// @dev All inputs are "xp" — balances already normalised to 1e18 AND already
///      rate-adjusted, so that the invariant's 1:1 peg assumption holds.
///      Passing raw balances of a non-par pair (e.g. USDC/EURC) into these
///      functions is a solvency bug. See StableSwap.sol for the adjustment.
library StableMath {
    uint256 internal constant N_COINS = 2;
    uint256 internal constant A_PRECISION = 100;
    uint256 internal constant MAX_LOOPS = 255;

    error DidNotConverge();

    /// @notice Compute the invariant D via Newton's method.
    /// @param xp0 Rate-adjusted, 1e18-normalised balance of coin 0.
    /// @param xp1 Rate-adjusted, 1e18-normalised balance of coin 1.
    /// @param amp Amplification coefficient, pre-multiplied by A_PRECISION.
    function getD(uint256 xp0, uint256 xp1, uint256 amp) internal pure returns (uint256) {
        uint256 s = xp0 + xp1;
        if (s == 0) return 0;

        uint256 d = s;
        uint256 ann = amp * N_COINS;

        for (uint256 i = 0; i < MAX_LOOPS; ++i) {
            uint256 dP = d;
            dP = (dP * d) / (xp0 * N_COINS);
            dP = (dP * d) / (xp1 * N_COINS);

            uint256 dPrev = d;
            d = (((ann * s) / A_PRECISION + dP * N_COINS) * d)
                / ((((ann - A_PRECISION) * d) / A_PRECISION) + (N_COINS + 1) * dP);

            if (d > dPrev) {
                if (d - dPrev <= 1) return d;
            } else {
                if (dPrev - d <= 1) return d;
            }
        }
        revert DidNotConverge();
    }

    /// @notice Given the new balance of one coin, solve for the balance of the other
    ///         that keeps D constant.
    /// @param xIn  New rate-adjusted balance of the coin being paid IN.
    /// @param d    The invariant to hold constant.
    /// @param amp  Amplification coefficient, pre-multiplied by A_PRECISION.
    /// @return y   Required rate-adjusted balance of the coin being paid OUT.
    function getY(uint256 xIn, uint256 d, uint256 amp) internal pure returns (uint256 y) {
        uint256 ann = amp * N_COINS;

        // c = D^(n+1) / (n^n * prod(x_known) * Ann)
        uint256 c = d;
        c = (c * d) / (xIn * N_COINS);
        c = (c * d * A_PRECISION) / (ann * N_COINS);

        uint256 b = xIn + (d * A_PRECISION) / ann;

        y = d;
        for (uint256 i = 0; i < MAX_LOOPS; ++i) {
            uint256 yPrev = y;
            y = (y * y + c) / (2 * y + b - d);

            if (y > yPrev) {
                if (y - yPrev <= 1) return y;
            } else {
                if (yPrev - y <= 1) return y;
            }
        }
        revert DidNotConverge();
    }
}
