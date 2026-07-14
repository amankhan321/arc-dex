// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Supplies the fair exchange rate of coin1 in units of coin0, 1e18-scaled.
///         For USDC/EURC this is the EUR/USD price (~1.08e18).
///         For a par pair (e.g. USDC/USYC) this is exactly 1e18.
interface IRateProvider {
    /// @return rate Value of 1 unit of coin1 denominated in coin0, 1e18 fixed point.
    function getRate() external view returns (uint256 rate);
}

/// @title ParRateProvider
/// @notice Immutable 1:1 rate. Correct for genuinely pegged pairs. Zero trust surface.
contract ParRateProvider is IRateProvider {
    function getRate() external pure returns (uint256) {
        return 1e18;
    }
}

/// @title GuardedRateProvider
/// @notice Pushed FX rate with hard guardrails. Used for USDC/EURC on Arc testnet,
///         where no canonical EUR/USD feed exists yet.
/// @dev The updater is the single trusted component in the system. It is deliberately
///      fenced in three ways so that a compromised updater cannot instantly drain the pool:
///        1. MAX_DEVIATION_BPS caps how far one update may move the rate.
///        2. MIN_UPDATE_INTERVAL caps how often it may move.
///        3. Consumers MUST treat a stale rate as fatal (see `getRate` revert).
///      Swap this out for a Chainlink adapter the moment an EUR/USD feed lands on Arc.
contract GuardedRateProvider is IRateProvider {
    uint256 public constant MAX_DEVIATION_BPS = 100; // 1% per update
    uint256 public constant MIN_UPDATE_INTERVAL = 5 minutes;
    uint256 public constant STALENESS_WINDOW = 6 hours;

    address public immutable updater;
    uint256 public rate;
    uint256 public updatedAt;

    error NotUpdater();
    error TooSoon();
    error DeviationTooLarge();
    error StaleRate();
    error ZeroRate();

    event RateUpdated(uint256 oldRate, uint256 newRate, uint256 timestamp);

    constructor(address updater_, uint256 initialRate) {
        if (updater_ == address(0) || initialRate == 0) revert ZeroRate();
        updater = updater_;
        rate = initialRate;
        updatedAt = block.timestamp;
    }

    function setRate(uint256 newRate) external {
        if (msg.sender != updater) revert NotUpdater();
        if (newRate == 0) revert ZeroRate();
        if (block.timestamp < updatedAt + MIN_UPDATE_INTERVAL) revert TooSoon();

        uint256 old = rate;
        uint256 diff = newRate > old ? newRate - old : old - newRate;
        if (diff * 10_000 > old * MAX_DEVIATION_BPS) revert DeviationTooLarge();

        rate = newRate;
        updatedAt = block.timestamp;
        emit RateUpdated(old, newRate, block.timestamp);
    }

    /// @dev Reverts rather than returning a stale rate. A frozen oracle must halt the
    ///      AMM, not silently let it price off a dead feed.
    function getRate() external view returns (uint256) {
        if (block.timestamp > updatedAt + STALENESS_WINDOW) revert StaleRate();
        return rate;
    }
}
