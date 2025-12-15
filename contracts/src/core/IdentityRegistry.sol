// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IIdentityRegistry.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";

contract IdentityRegistry is IIdentityRegistry {
    mapping(bytes32 => Robot) private _robots;

    modifier onlyController(bytes32 robotId) {
        if (_robots[robotId].controller != msg.sender) revert Errors.NotAuthorized();
        _;
    }

    modifier robotExists(bytes32 robotId) {
        if (_robots[robotId].controller == address(0)) revert Errors.RobotNotFound();
        _;
    }

    function registerRobot(bytes32 robotId, address controller, bytes calldata pubkey) external {
        if (controller == address(0)) revert Errors.ZeroAddress();
        if (_robots[robotId].controller != address(0)) revert Errors.RobotAlreadyExists();

        _robots[robotId] = Robot({ controller: controller, pubkey: pubkey, metadataHash: bytes32(0), active: true });

        emit Events.RobotRegistered(robotId, controller, pubkey);
    }

    function rotateKey(bytes32 robotId, bytes calldata newPubkey) external robotExists(robotId) onlyController(robotId) {
        _robots[robotId].pubkey = newPubkey;
        emit Events.RobotKeyRotated(robotId, newPubkey);
    }

    function updateMetadata(
        bytes32 robotId,
        bytes32 newMetadataHash
    ) external robotExists(robotId) onlyController(robotId) {
        _robots[robotId].metadataHash = newMetadataHash;
        emit Events.RobotMetadataUpdated(robotId, newMetadataHash);
    }

    function deactivateRobot(bytes32 robotId) external robotExists(robotId) onlyController(robotId) {
        _robots[robotId].active = false;
    }

    function getController(bytes32 robotId) external view returns (address) {
        return _robots[robotId].controller;
    }

    function getRobot(bytes32 robotId) external view returns (Robot memory) {
        return _robots[robotId];
    }

    function isActive(bytes32 robotId) external view returns (bool) {
        return _robots[robotId].active;
    }
}
