// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library EIP712Types {
    bytes32 public constant COMPLETION_CLAIM_TYPEHASH = keccak256(
        "CompletionClaim(uint256 jobId,bytes32 jobSpecHash,bytes32 completionHash,bytes32 robotId,address controller,uint256 deadline)"
    );

    bytes32 public constant COMPLETION_CLAIM_V2_TYPEHASH = keccak256(
        "CompletionClaimV2(uint256 jobId,bytes32 jobSpecHash,bytes32 completionHash,bytes32 robotId,address controller,uint256 deadline,uint8 qualityScore,uint32 workUnits)"
    );

    bytes32 public constant WITNESS_CLAIM_TYPEHASH = keccak256(
        "WitnessClaim(uint256 jobId,bytes32 completionHash,address witness,uint256 issuedAt)"
    );

    struct CompletionClaim {
        uint256 jobId;
        bytes32 jobSpecHash;
        bytes32 completionHash;
        bytes32 robotId;
        address controller;
        uint256 deadline;
    }

    struct CompletionClaimV2 {
        uint256 jobId;
        bytes32 jobSpecHash;
        bytes32 completionHash;
        bytes32 robotId;
        address controller;
        uint256 deadline;
        uint8 qualityScore;
        uint32 workUnits;
    }

    struct WitnessClaim {
        uint256 jobId;
        bytes32 completionHash;
        address witness;
        uint256 issuedAt;
    }

    function hashCompletionClaim(CompletionClaim memory claim) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                COMPLETION_CLAIM_TYPEHASH,
                claim.jobId,
                claim.jobSpecHash,
                claim.completionHash,
                claim.robotId,
                claim.controller,
                claim.deadline
            )
        );
    }

    function hashWitnessClaim(WitnessClaim memory claim) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(WITNESS_CLAIM_TYPEHASH, claim.jobId, claim.completionHash, claim.witness, claim.issuedAt)
        );
    }

    function hashCompletionClaimV2(CompletionClaimV2 memory claim) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                COMPLETION_CLAIM_V2_TYPEHASH,
                claim.jobId,
                claim.jobSpecHash,
                claim.completionHash,
                claim.robotId,
                claim.controller,
                claim.deadline,
                claim.qualityScore,
                claim.workUnits
            )
        );
    }
}
