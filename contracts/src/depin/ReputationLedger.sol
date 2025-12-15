// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IReputationLedger.sol";
import "../libraries/Errors.sol";

/**
 * @title ReputationLedger
 * @notice Tracks operator/robot reputation metrics
 * @dev Reliability formula:
 *   reliabilityScoreBps = 10000 - min(5000, disputes*500) - min(5000, slashes*1000)
 *   - Each dispute costs 5% (up to 50% max)
 *   - Each slash costs 10% (up to 50% max)
 *   - New robots start at 100%
 */
contract ReputationLedger is IReputationLedger {
    mapping(bytes32 => ReputationData) private _reputation;

    address public jobEscrow;
    address public disputeManager;
    address public admin;

    uint16 public constant DISPUTE_PENALTY_BPS = 500; // 5% per dispute
    uint16 public constant SLASH_PENALTY_BPS = 1000; // 10% per slash
    uint16 public constant MAX_DISPUTE_PENALTY = 5000; // Max 50% from disputes
    uint16 public constant MAX_SLASH_PENALTY = 5000; // Max 50% from slashes

    modifier onlyJobEscrow() {
        if (msg.sender != jobEscrow) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyDisputeManager() {
        if (msg.sender != disputeManager) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Errors.NotAuthorized();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function setJobEscrow(address _jobEscrow) external onlyAdmin {
        if (_jobEscrow == address(0)) revert Errors.ZeroAddress();
        jobEscrow = _jobEscrow;
    }

    function setDisputeManager(address _disputeManager) external onlyAdmin {
        if (_disputeManager == address(0)) revert Errors.ZeroAddress();
        disputeManager = _disputeManager;
    }

    /**
     * @notice Record a completed job for reputation
     * @param robotId The robot identifier
     */
    function recordJobComplete(bytes32 robotId) external onlyJobEscrow {
        _reputation[robotId].totalJobs++;
        _updateReliabilityScore(robotId);
    }

    /**
     * @notice Record a dispute against a robot
     * @param robotId The robot identifier
     */
    function recordDispute(bytes32 robotId) external onlyDisputeManager {
        _reputation[robotId].totalDisputes++;
        _updateReliabilityScore(robotId);
    }

    /**
     * @notice Record a slash against a robot
     * @param robotId The robot identifier
     */
    function recordSlash(bytes32 robotId) external onlyDisputeManager {
        _reputation[robotId].totalSlashes++;
        _updateReliabilityScore(robotId);
    }

    function _updateReliabilityScore(bytes32 robotId) internal {
        ReputationData storage rep = _reputation[robotId];

        uint256 disputePenalty = _min(MAX_DISPUTE_PENALTY, uint256(rep.totalDisputes) * DISPUTE_PENALTY_BPS);
        uint256 slashPenalty = _min(MAX_SLASH_PENALTY, uint256(rep.totalSlashes) * SLASH_PENALTY_BPS);

        uint256 totalPenalty = disputePenalty + slashPenalty;
        rep.reliabilityScoreBps = totalPenalty >= 10000 ? 0 : uint16(10000 - totalPenalty);

        emit ReputationUpdated(robotId, rep.totalJobs, rep.reliabilityScoreBps);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /**
     * @notice Get full reputation data for a robot
     * @param robotId The robot identifier
     */
    function getReputation(bytes32 robotId) external view returns (ReputationData memory) {
        return _reputation[robotId];
    }

    /**
     * @notice Get reliability score for a robot
     * @param robotId The robot identifier
     * @return Reliability in basis points (0-10000)
     */
    function getReliabilityScoreBps(bytes32 robotId) external view returns (uint16) {
        ReputationData storage rep = _reputation[robotId];
        // New robots start at 100%
        if (rep.totalJobs == 0 && rep.totalDisputes == 0 && rep.totalSlashes == 0) {
            return 10000;
        }
        return rep.reliabilityScoreBps;
    }
}
