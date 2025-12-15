// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/depin/StakingGate.sol";
import "../../src/mocks/MockERC20.sol";

contract StakingGateTest is Test {
    StakingGate public stakingGate;
    MockERC20 public vrwxToken;

    address public admin;
    address public operator;
    address public disputeManager;
    address public challenger;

    function setUp() public {
        admin = address(this);
        operator = address(0x1);
        disputeManager = address(0x2);
        challenger = address(0x3);

        vrwxToken = new MockERC20();
        stakingGate = new StakingGate(address(vrwxToken));
        stakingGate.setDisputeManager(disputeManager);

        // Mint tokens to operator
        vrwxToken.mint(operator, 10000 ether);
    }

    function test_StakeAndUnstake() public {
        // Operator approves and stakes
        vm.startPrank(operator);
        vrwxToken.approve(address(stakingGate), 2000 ether);
        stakingGate.stake(2000 ether);

        IStakingGate.StakeData memory stakeData = stakingGate.getStake(operator);
        assertEq(stakeData.staked, 2000 ether);
        assertTrue(stakingGate.hasMinStake(operator));

        // Request unlock
        stakingGate.requestUnlock(1000 ether);
        stakeData = stakingGate.getStake(operator);
        assertEq(stakeData.unlockAmount, 1000 ether);
        assertTrue(stakeData.unlockRequestedAt > 0);

        // Fast forward past timelock
        vm.warp(block.timestamp + 7 days + 1);

        // Unstake
        stakingGate.unstake();
        stakeData = stakingGate.getStake(operator);
        assertEq(stakeData.staked, 1000 ether);
        assertEq(stakeData.unlockAmount, 0);
        assertEq(vrwxToken.balanceOf(operator), 9000 ether); // 10000 - 2000 + 1000
        vm.stopPrank();
    }

    function test_TimelockEnforced() public {
        vm.startPrank(operator);
        vrwxToken.approve(address(stakingGate), 2000 ether);
        stakingGate.stake(2000 ether);
        stakingGate.requestUnlock(1000 ether);

        // Try to unstake before timelock expires
        vm.warp(block.timestamp + 6 days);
        vm.expectRevert(Errors.TimelockActive.selector);
        stakingGate.unstake();
        vm.stopPrank();
    }

    function test_SlashOnFraud() public {
        // Operator stakes
        vm.startPrank(operator);
        vrwxToken.approve(address(stakingGate), 2000 ether);
        stakingGate.stake(2000 ether);
        vm.stopPrank();

        // Dispute manager slashes (25%)
        vm.prank(disputeManager);
        stakingGate.slashStakeVRWX(operator, challenger);

        IStakingGate.StakeData memory stakeData = stakingGate.getStake(operator);
        assertEq(stakeData.staked, 1500 ether); // 2000 - 25% = 1500
        assertEq(vrwxToken.balanceOf(challenger), 500 ether); // Challenger receives 25%
    }

    function test_CancelUnlock() public {
        vm.startPrank(operator);
        vrwxToken.approve(address(stakingGate), 2000 ether);
        stakingGate.stake(2000 ether);
        stakingGate.requestUnlock(1000 ether);

        // Cancel unlock
        stakingGate.cancelUnlock();

        IStakingGate.StakeData memory stakeData = stakingGate.getStake(operator);
        assertEq(stakeData.unlockAmount, 0);
        assertEq(stakeData.unlockRequestedAt, 0);
        vm.stopPrank();
    }

    function test_SlashCancelsUnlock() public {
        vm.startPrank(operator);
        vrwxToken.approve(address(stakingGate), 2000 ether);
        stakingGate.stake(2000 ether);
        stakingGate.requestUnlock(1800 ether); // Request most of stake
        vm.stopPrank();

        // Slash reduces stake below unlock amount
        vm.prank(disputeManager);
        stakingGate.slashStakeVRWX(operator, challenger);

        // Unlock should be cancelled
        IStakingGate.StakeData memory stakeData = stakingGate.getStake(operator);
        assertEq(stakeData.staked, 1500 ether);
        assertEq(stakeData.unlockAmount, 0);
        assertEq(stakeData.unlockRequestedAt, 0);
    }
}
