// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIdentityRegistry {
    struct Robot {
        address controller;
        bytes pubkey;
        bytes32 metadataHash;
        bool active;
    }

    function registerRobot(bytes32 robotId, address controller, bytes calldata pubkey) external;
    function rotateKey(bytes32 robotId, bytes calldata newPubkey) external;
    function updateMetadata(bytes32 robotId, bytes32 newMetadataHash) external;
    function deactivateRobot(bytes32 robotId) external;

    function getController(bytes32 robotId) external view returns (address);
    function getRobot(bytes32 robotId) external view returns (Robot memory);
    function isActive(bytes32 robotId) external view returns (bool);
}
