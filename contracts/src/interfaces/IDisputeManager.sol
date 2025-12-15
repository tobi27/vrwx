// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDisputeManager {
    enum Verdict {
        PENDING,
        VALID,
        FRAUD,
        NON_DELIVERY
    }

    struct Dispute {
        uint256 jobId;
        address challenger;
        bytes32 reasonHash;
        Verdict verdict;
        uint256 createdAt;
    }

    function openDispute(uint256 jobId, bytes32 reasonHash) external;
    function resolve(uint256 jobId, Verdict verdict) external;

    function getDispute(uint256 jobId) external view returns (Dispute memory);
    function hasDispute(uint256 jobId) external view returns (bool);
}
