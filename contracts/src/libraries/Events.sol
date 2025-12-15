// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library Events {
    // IdentityRegistry events
    event RobotRegistered(bytes32 indexed robotId, address indexed controller, bytes pubkey);
    event RobotKeyRotated(bytes32 indexed robotId, bytes newPubkey);
    event RobotMetadataUpdated(bytes32 indexed robotId, bytes32 metadataHash);

    // BondManager events
    event BondDeposited(bytes32 indexed robotId, uint256 amount, uint256 newTotal);
    event BondWithdrawn(bytes32 indexed robotId, uint256 amount, uint256 newTotal);
    event BondLocked(bytes32 indexed robotId, uint256 amount, uint256 totalLocked);
    event BondUnlocked(bytes32 indexed robotId, uint256 amount, uint256 totalLocked);
    event BondSlashed(bytes32 indexed robotId, uint256 amount, address recipient);

    // JobEscrow events
    event JobCreated(
        uint256 indexed jobId,
        address indexed buyer,
        bytes32 indexed robotId,
        bytes32 jobSpecHash,
        uint256 price,
        uint256 deadline
    );
    event JobFunded(uint256 indexed jobId, uint256 amount);
    event CompletionSubmitted(uint256 indexed jobId, bytes32 completionHash, address submitter);
    event JobSettled(uint256 indexed jobId, uint256 tokenId, uint256 payout, uint256 fee);
    event JobRefunded(uint256 indexed jobId, address buyer, uint256 amount);

    // DisputeManager events
    event DisputeOpened(uint256 indexed jobId, address indexed challenger, bytes32 reasonHash);
    event DisputeResolved(uint256 indexed jobId, uint8 verdict);

    // Receipt1155 events
    event ReceiptMinted(uint256 indexed jobId, uint256 indexed tokenId, address to, bytes32 metadataHash);
    event ReceiptBurned(uint256 indexed tokenId);

    // Multi-Service V2 events
    event OfferCreatedV2(
        uint256 indexed offerId,
        bytes32 indexed serviceTypeHash,
        address operator,
        bytes32 robotId,
        bytes32 jobSpecHash,
        uint256 price,
        uint64 deadline
    );
    event OfferFilledV2(uint256 indexed offerId, uint256 indexed jobId, bytes32 indexed serviceTypeHash);
    event JobCreatedV2(
        uint256 indexed jobId,
        bytes32 indexed serviceTypeHash,
        address buyer,
        bytes32 robotId,
        uint256 price,
        uint256 deadline
    );
    event JobSettledV2(
        uint256 indexed jobId,
        bytes32 indexed serviceTypeHash,
        uint256 receiptTokenId,
        uint8 outcome
    );
}
