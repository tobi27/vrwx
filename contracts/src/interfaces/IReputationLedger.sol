// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReputationLedger {
    struct ReputationData {
        uint64 totalJobs;
        uint32 totalDisputes;
        uint32 totalSlashes;
        uint16 reliabilityScoreBps; // 0-10000 (0-100%)
    }

    event ReputationUpdated(bytes32 indexed robotId, uint64 totalJobs, uint16 reliabilityScoreBps);

    function recordJobComplete(bytes32 robotId) external;
    function recordDispute(bytes32 robotId) external;
    function recordSlash(bytes32 robotId) external;

    function getReputation(bytes32 robotId) external view returns (ReputationData memory);
    function getReliabilityScoreBps(bytes32 robotId) external view returns (uint16);
}
