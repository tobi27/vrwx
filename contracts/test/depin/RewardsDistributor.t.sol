// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/depin/RewardsDistributor.sol";
import "../../src/depin/VRWXToken.sol";
import "../../src/depin/ReputationLedger.sol";

contract RewardsDistributorTest is Test {
    RewardsDistributor public distributor;
    VRWXToken public vrwxToken;
    ReputationLedger public reputationLedger;

    address public admin;
    address public jobEscrow;
    address public controller;
    bytes32 public robotId = keccak256("robot-1");

    function setUp() public {
        admin = address(this);
        jobEscrow = address(0x1);
        controller = address(0x2);

        vrwxToken = new VRWXToken();
        reputationLedger = new ReputationLedger();
        distributor = new RewardsDistributor(address(vrwxToken));

        // Configure
        distributor.setJobEscrow(jobEscrow);
        distributor.setReputationLedger(address(reputationLedger));

        // Grant MINTER_ROLE to distributor
        vrwxToken.grantRole(vrwxToken.MINTER_ROLE(), address(distributor));
    }

    function test_RewardCalculation() public {
        // Base test: 100 score, 1 work unit, new robot (1.5x reliability)
        // Expected: 100 VRWX * 1 * 1.0 (quality) * 1.5 (reliability) = 150 VRWX

        IRewardsDistributor.RewardParams memory params = IRewardsDistributor.RewardParams({
            robotId: robotId,
            controller: controller,
            qualityScore: 100,
            workUnits: 1,
            jobPrice: 1000 ether
        });

        vm.prank(jobEscrow);
        distributor.onJobFinal(1, params);

        // New robots get 1.5x reliability bonus
        assertEq(vrwxToken.balanceOf(controller), 150 ether);
    }

    function test_QualityMultiplier() public {
        // All tests include 1.5x reliability for new robots
        // Test low quality score (80 = 0.8x)
        IRewardsDistributor.RewardParams memory params = IRewardsDistributor.RewardParams({
            robotId: robotId,
            controller: controller,
            qualityScore: 80,
            workUnits: 1,
            jobPrice: 1000 ether
        });

        uint256 preview = distributor.previewReward(params);
        // 100 * 1 * 0.8 * 1.5 = 120 VRWX
        assertEq(preview, 120 ether);

        // Test high quality score (120 = 1.2x)
        params.qualityScore = 120;
        preview = distributor.previewReward(params);
        // 100 * 1 * 1.2 * 1.5 = 180 VRWX
        assertEq(preview, 180 ether);

        // Test mid quality score (100 = 1.0x)
        params.qualityScore = 100;
        preview = distributor.previewReward(params);
        // 100 * 1 * 1.0 * 1.5 = 150 VRWX
        assertEq(preview, 150 ether);
    }

    function test_WorkUnitsMultiplier() public {
        IRewardsDistributor.RewardParams memory params = IRewardsDistributor.RewardParams({
            robotId: robotId,
            controller: controller,
            qualityScore: 100,
            workUnits: 10,
            jobPrice: 1000 ether
        });

        uint256 preview = distributor.previewReward(params);
        // 100 * 10 * 1.0 * 1.5 = 1500 VRWX
        assertEq(preview, 1500 ether);
    }

    function test_OnlyJobEscrowCanCall() public {
        IRewardsDistributor.RewardParams memory params = IRewardsDistributor.RewardParams({
            robotId: robotId,
            controller: controller,
            qualityScore: 100,
            workUnits: 1,
            jobPrice: 1000 ether
        });

        vm.prank(address(0x999));
        vm.expectRevert(Errors.NotAuthorized.selector);
        distributor.onJobFinal(1, params);
    }

    function test_ReliabilityMultiplierAffectsReward() public {
        // First, damage the robot's reputation
        reputationLedger.setJobEscrow(address(this));
        reputationLedger.setDisputeManager(address(this));

        // Add some disputes to lower reliability
        reputationLedger.recordDispute(robotId);
        reputationLedger.recordDispute(robotId);
        // Now reliability = 90% (10000 - 500 - 500)

        IRewardsDistributor.RewardParams memory params = IRewardsDistributor.RewardParams({
            robotId: robotId,
            controller: controller,
            qualityScore: 100,
            workUnits: 1,
            jobPrice: 1000 ether
        });

        uint256 preview = distributor.previewReward(params);
        // reliability = 9000 BPS
        // reliabilityMult = 5000 + (9000 * 10000 / 10000) = 5000 + 9000 = 14000? No wait...
        // reliabilityMult = MIN_RELIABILITY_MULT + (reliabilityBps * (MAX - MIN) / 10000)
        // = 5000 + (9000 * 10000 / 10000) = 5000 + 9000 = 14000
        // reward = 100 * 1 * 10000 * 14000 / (10000 * 10000) = 140 VRWX
        assertEq(preview, 140 ether);
    }
}
