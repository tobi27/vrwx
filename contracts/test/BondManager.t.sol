// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Setup.t.sol";
import "../src/libraries/Errors.sol";

contract BondManagerTest is Setup {
    function test_Deposit() public {
        bytes32 newRobotId = keccak256("robot-003");
        address newController = makeAddr("newController");
        identity.registerRobot(newRobotId, newController, "");

        uint256 depositAmount = 100 ether;
        token.mint(newController, depositAmount);

        vm.prank(newController);
        token.approve(address(bond), depositAmount);

        vm.prank(newController);
        bond.deposit(newRobotId, depositAmount);

        assertEq(bond.bonded(newRobotId), depositAmount);
        assertEq(bond.available(newRobotId), depositAmount);
    }

    function test_Withdraw() public {
        uint256 withdrawAmount = 50 ether;

        vm.prank(robotController);
        bond.withdraw(robotId, withdrawAmount);

        assertEq(bond.bonded(robotId), BOND_AMOUNT - withdrawAmount);
    }

    function test_RevertWhen_WithdrawMoreThanAvailable() public {
        // Lock some bond first
        vm.prank(address(escrow));
        bond.lock(robotId, 100 ether);

        // Try to withdraw more than available
        vm.prank(robotController);
        vm.expectRevert(Errors.InsufficientBalance.selector);
        bond.withdraw(robotId, 150 ether);
    }

    function test_Lock() public {
        uint256 lockAmount = 50 ether;

        vm.prank(address(escrow));
        bond.lock(robotId, lockAmount);

        assertEq(bond.locked(robotId), lockAmount);
        assertEq(bond.available(robotId), BOND_AMOUNT - lockAmount);
    }

    function test_Unlock() public {
        uint256 lockAmount = 50 ether;

        vm.prank(address(escrow));
        bond.lock(robotId, lockAmount);

        vm.prank(address(escrow));
        bond.unlock(robotId, lockAmount);

        assertEq(bond.locked(robotId), 0);
        assertEq(bond.available(robotId), BOND_AMOUNT);
    }

    function test_Slash() public {
        uint256 lockAmount = 100 ether;
        uint256 slashAmount = 50 ether;
        address recipient = makeAddr("recipient");

        vm.prank(address(escrow));
        bond.lock(robotId, lockAmount);

        uint256 recipientBalanceBefore = token.balanceOf(recipient);

        vm.prank(address(dispute));
        bond.slash(robotId, slashAmount, recipient);

        assertEq(bond.locked(robotId), lockAmount - slashAmount);
        assertEq(bond.bonded(robotId), BOND_AMOUNT - slashAmount);
        assertEq(token.balanceOf(recipient), recipientBalanceBefore + slashAmount);
    }

    function test_RevertWhen_UnauthorizedLock() public {
        vm.expectRevert(Errors.NotAuthorized.selector);
        bond.lock(robotId, 50 ether);
    }

    function test_RevertWhen_UnauthorizedSlash() public {
        vm.expectRevert(Errors.NotAuthorized.selector);
        bond.slash(robotId, 50 ether, buyer);
    }
}
