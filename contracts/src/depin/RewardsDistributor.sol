// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IRewardsDistributor.sol";
import "../interfaces/IVRWXToken.sol";
import "../interfaces/IReputationLedger.sol";
import "../libraries/Errors.sol";

/**
 * @title RewardsDistributor
 * @notice Mints VRWX rewards on successful job settlement
 * @dev Called by JobEscrow.settle() when enabled
 *
 * Formula: reward = baseReward * workUnits * qualityMultiplier * reliabilityMultiplier
 *
 * Where:
 * - baseReward = 100 VRWX (configurable)
 * - workUnits = from CompletionClaim (1-65535)
 * - qualityMultiplier = qualityScore / 100 (0.8x to 1.2x based on 80-120 score)
 * - reliabilityMultiplier = from ReputationLedger (0.5x to 1.5x)
 */
contract RewardsDistributor is IRewardsDistributor {
    IVRWXToken public immutable vrwxToken;
    IReputationLedger public reputationLedger;

    address public jobEscrow;
    address public admin;

    uint256 public baseReward = 100 ether; // 100 VRWX base per job

    // Multiplier bounds (in BPS: 10000 = 1x)
    uint16 public constant MIN_QUALITY_MULT = 8000; // 0.8x for score < 80
    uint16 public constant MAX_QUALITY_MULT = 12000; // 1.2x for score >= 120
    uint16 public constant MIN_RELIABILITY_MULT = 5000; // 0.5x
    uint16 public constant MAX_RELIABILITY_MULT = 15000; // 1.5x

    modifier onlyJobEscrow() {
        if (msg.sender != jobEscrow) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Errors.NotAuthorized();
        _;
    }

    constructor(address _vrwxToken) {
        if (_vrwxToken == address(0)) revert Errors.ZeroAddress();
        vrwxToken = IVRWXToken(_vrwxToken);
        admin = msg.sender;
    }

    function setJobEscrow(address _jobEscrow) external onlyAdmin {
        if (_jobEscrow == address(0)) revert Errors.ZeroAddress();
        jobEscrow = _jobEscrow;
    }

    function setReputationLedger(address _ledger) external onlyAdmin {
        reputationLedger = IReputationLedger(_ledger);
    }

    function setBaseReward(uint256 _baseReward) external onlyAdmin {
        baseReward = _baseReward;
    }

    /**
     * @notice Calculate and distribute rewards for a settled job
     * @param jobId The job ID (for event tracking)
     * @param params Reward calculation parameters
     */
    function onJobFinal(uint256 jobId, RewardParams calldata params) external onlyJobEscrow {
        // Calculate quality multiplier (80-120 mapped to 0.8x-1.2x)
        uint256 qualityMult = _calculateQualityMultiplier(params.qualityScore);

        // Get reliability multiplier from reputation ledger
        uint256 reliabilityMult = _getReliabilityMultiplier(params.robotId);

        // Calculate final reward
        // reward = baseReward * workUnits * qualityMult * reliabilityMult / (10000 * 10000)
        uint256 reward = (baseReward * params.workUnits * qualityMult * reliabilityMult) / (10000 * 10000);

        // Mint to controller
        if (reward > 0) {
            vrwxToken.mint(params.controller, reward);
            emit RewardMinted(params.robotId, params.controller, reward);
        }
    }

    /**
     * @notice Calculate quality multiplier based on score
     * @param score Quality score (0-255, but 80-120 range used for multiplier)
     * @return Multiplier in BPS (8000-12000)
     */
    function _calculateQualityMultiplier(uint8 score) internal pure returns (uint256) {
        if (score < 80) return MIN_QUALITY_MULT;
        if (score >= 120) return MAX_QUALITY_MULT;
        // Linear interpolation: 80->8000, 120->12000
        return MIN_QUALITY_MULT + ((uint256(score) - 80) * 100);
    }

    /**
     * @notice Get reliability multiplier from reputation ledger
     * @param robotId The robot identifier
     * @return Multiplier in BPS (5000-15000)
     */
    function _getReliabilityMultiplier(bytes32 robotId) internal view returns (uint256) {
        if (address(reputationLedger) == address(0)) return 10000; // 1x default

        uint16 reliabilityBps = reputationLedger.getReliabilityScoreBps(robotId);
        // Map 0-10000 BPS to MIN_RELIABILITY_MULT-MAX_RELIABILITY_MULT
        // reliabilityBps 0 -> 5000, reliabilityBps 10000 -> 15000
        return MIN_RELIABILITY_MULT + ((uint256(reliabilityBps) * (MAX_RELIABILITY_MULT - MIN_RELIABILITY_MULT)) / 10000);
    }

    /**
     * @notice Preview reward calculation (view function)
     */
    function previewReward(RewardParams calldata params) external view returns (uint256) {
        uint256 qualityMult = _calculateQualityMultiplier(params.qualityScore);
        uint256 reliabilityMult = _getReliabilityMultiplier(params.robotId);
        return (baseReward * params.workUnits * qualityMult * reliabilityMult) / (10000 * 10000);
    }
}
