// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRewardsDistributor {
    struct RewardParams {
        bytes32 robotId;
        address controller;
        uint8 qualityScore; // 0-255, capped at 100 for multiplier calc
        uint32 workUnits; // 1-65535
        uint256 jobPrice; // For potential price-based scaling
    }

    event RewardMinted(bytes32 indexed robotId, address indexed controller, uint256 amount);

    function onJobFinal(uint256 jobId, RewardParams calldata params) external;
    function setBaseReward(uint256 newBaseReward) external;
    function setReputationLedger(address ledger) external;
}
