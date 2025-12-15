// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOfferBook {
    struct Offer {
        address operator;
        bytes32 robotId;
        bytes32 jobSpecHash;
        uint256 price;
        uint256 expiresAt;
        bool active;
    }

    // V1 Events
    event OfferCreated(uint256 indexed offerId, address indexed operator, bytes32 indexed robotId, uint256 price);
    event OfferCancelled(uint256 indexed offerId);
    event OfferPurchased(uint256 indexed offerId, address indexed buyer, uint256 jobId);

    // V2 Events (Multi-Service)
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

    // V1 Functions
    function createOffer(bytes32 robotId, bytes32 jobSpecHash, uint256 price, uint256 duration) external returns (uint256 offerId);
    function cancelOffer(uint256 offerId) external;
    function buyOffer(uint256 offerId) external returns (uint256 jobId);

    function getOffer(uint256 offerId) external view returns (Offer memory);
    function offerCount() external view returns (uint256);

    // V2 Functions (Multi-Service)
    function createOfferV2(
        bytes32 serviceTypeHash,
        bytes32 robotId,
        bytes32 jobSpecHash,
        uint256 price,
        uint64 deadline,
        uint256 minBond
    ) external returns (uint256 offerId);

    function buyOfferV2(uint256 offerId) external returns (uint256 jobId);

    function offerServiceTypes(uint256 offerId) external view returns (bytes32);
}
