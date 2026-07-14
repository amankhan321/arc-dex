// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title TickBitmap
/// @notice Uniswap-V3-style bitmap over price ticks, used to find the best bid / best ask
///         without walking every empty price level.
/// @dev Tick 0 is reserved as the "none" sentinel; valid ticks are 1..MAX_TICK.
///      Scans are hard-bounded by MAX_WORD_SCAN. A truncated scan can only ever report
///      LESS liquidity than exists, never more — so the worst case is an under-fill,
///      which the caller's minAmountOut already guards against. It can never be used to
///      over-pay a taker or under-pay a maker.
library TickBitmap {
    uint32 internal constant MAX_TICK = 1_048_575; // 2**20 - 1
    uint256 internal constant MAX_WORD_SCAN = 64;

    function flip(mapping(uint16 => uint256) storage self, uint32 tick) internal {
        self[uint16(tick >> 8)] ^= (uint256(1) << (tick & 0xff));
    }

    function isInitialized(mapping(uint16 => uint256) storage self, uint32 tick) internal view returns (bool) {
        return self[uint16(tick >> 8)] & (uint256(1) << (tick & 0xff)) != 0;
    }

    /// @notice Highest initialised tick <= `from`. Returns 0 if none found.
    function highestAtOrBelow(mapping(uint16 => uint256) storage self, uint32 from) internal view returns (uint32) {
        if (from == 0) return 0;

        uint256 word = uint256(from) >> 8;
        uint8 bit = uint8(from & 0xff);

        uint256 mask = bit == 255 ? type(uint256).max : (uint256(1) << (bit + 1)) - 1;
        uint256 w = self[uint16(word)] & mask;

        for (uint256 scans = 0; scans <= MAX_WORD_SCAN; ++scans) {
            if (w != 0) return uint32(word * 256 + _msb(w));
            if (word == 0) return 0;
            unchecked {
                --word;
            }
            w = self[uint16(word)];
        }
        return 0;
    }

    /// @notice Lowest initialised tick >= `from`. Returns 0 if none found.
    function lowestAtOrAbove(mapping(uint16 => uint256) storage self, uint32 from) internal view returns (uint32) {
        if (from == 0) from = 1;
        if (from > MAX_TICK) return 0;

        uint256 word = uint256(from) >> 8;
        uint8 bit = uint8(from & 0xff);

        uint256 mask = ~((uint256(1) << bit) - 1);
        uint256 w = self[uint16(word)] & mask;

        uint256 maxWord = uint256(MAX_TICK) >> 8;
        for (uint256 scans = 0; scans <= MAX_WORD_SCAN; ++scans) {
            if (w != 0) return uint32(word * 256 + _lsb(w));
            if (word >= maxWord) return 0;
            unchecked {
                ++word;
            }
            w = self[uint16(word)];
        }
        return 0;
    }

    function _msb(uint256 x) private pure returns (uint8 r) {
        if (x >= 1 << 128) { x >>= 128; r += 128; }
        if (x >= 1 << 64)  { x >>= 64;  r += 64;  }
        if (x >= 1 << 32)  { x >>= 32;  r += 32;  }
        if (x >= 1 << 16)  { x >>= 16;  r += 16;  }
        if (x >= 1 << 8)   { x >>= 8;   r += 8;   }
        if (x >= 1 << 4)   { x >>= 4;   r += 4;   }
        if (x >= 1 << 2)   { x >>= 2;   r += 2;   }
        if (x >= 1 << 1)   {            r += 1;   }
    }

    function _lsb(uint256 x) private pure returns (uint8 r) {
        return _msb(x & (~x + 1));
    }
}
