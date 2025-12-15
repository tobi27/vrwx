// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Setup.t.sol";
import "../src/libraries/Errors.sol";

contract IdentityRegistryTest is Setup {
    bytes32 public newRobotId = keccak256("robot-002");

    function test_RegisterRobot() public {
        address newController = makeAddr("newController");

        identity.registerRobot(newRobotId, newController, "pubkey123");

        assertEq(identity.getController(newRobotId), newController);
        assertTrue(identity.isActive(newRobotId));
    }

    function test_RevertWhen_RegisterDuplicate() public {
        vm.expectRevert(Errors.RobotAlreadyExists.selector);
        identity.registerRobot(robotId, robotController, "");
    }

    function test_RevertWhen_RegisterZeroAddress() public {
        vm.expectRevert(Errors.ZeroAddress.selector);
        identity.registerRobot(newRobotId, address(0), "");
    }

    function test_RotateKey() public {
        bytes memory newPubkey = "newPubkey456";

        vm.prank(robotController);
        identity.rotateKey(robotId, newPubkey);

        IIdentityRegistry.Robot memory robot = identity.getRobot(robotId);
        assertEq(robot.pubkey, newPubkey);
    }

    function test_RevertWhen_RotateKeyUnauthorized() public {
        vm.prank(buyer);
        vm.expectRevert(Errors.NotAuthorized.selector);
        identity.rotateKey(robotId, "newKey");
    }

    function test_UpdateMetadata() public {
        bytes32 newMetadata = keccak256("new metadata");

        vm.prank(robotController);
        identity.updateMetadata(robotId, newMetadata);

        IIdentityRegistry.Robot memory robot = identity.getRobot(robotId);
        assertEq(robot.metadataHash, newMetadata);
    }

    function test_DeactivateRobot() public {
        vm.prank(robotController);
        identity.deactivateRobot(robotId);

        assertFalse(identity.isActive(robotId));
    }
}
