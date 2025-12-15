// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/depin/ReputationLedger.sol";

contract ReputationLedgerTest is Test {
    ReputationLedger public ledger;

    address public admin;
    address public jobEscrow;
    address public disputeManager;
    bytes32 public robotId = keccak256("robot-1");

    function setUp() public {
        admin = address(this);
        jobEscrow = address(0x1);
        disputeManager = address(0x2);

        ledger = new ReputationLedger();
        ledger.setJobEscrow(jobEscrow);
        ledger.setDisputeManager(disputeManager);
    }

    function test_InitialScoreIs100Percent() public view {
        uint16 score = ledger.getReliabilityScoreBps(robotId);
        assertEq(score, 10000); // 100%
    }

    function test_DisputePenalty() public {
        // Record a dispute (5% penalty)
        vm.prank(disputeManager);
        ledger.recordDispute(robotId);

        IReputationLedger.ReputationData memory rep = ledger.getReputation(robotId);
        assertEq(rep.totalDisputes, 1);
        assertEq(rep.reliabilityScoreBps, 9500); // 100% - 5% = 95%

        // Record another dispute
        vm.prank(disputeManager);
        ledger.recordDispute(robotId);

        rep = ledger.getReputation(robotId);
        assertEq(rep.totalDisputes, 2);
        assertEq(rep.reliabilityScoreBps, 9000); // 100% - 10% = 90%
    }

    function test_SlashPenalty() public {
        // Record a slash (10% penalty)
        vm.prank(disputeManager);
        ledger.recordSlash(robotId);

        IReputationLedger.ReputationData memory rep = ledger.getReputation(robotId);
        assertEq(rep.totalSlashes, 1);
        assertEq(rep.reliabilityScoreBps, 9000); // 100% - 10% = 90%
    }

    function test_MaxDisputePenaltyCapped() public {
        // Record 10+ disputes to hit the cap
        for (uint256 i = 0; i < 12; i++) {
            vm.prank(disputeManager);
            ledger.recordDispute(robotId);
        }

        IReputationLedger.ReputationData memory rep = ledger.getReputation(robotId);
        assertEq(rep.totalDisputes, 12);
        // Cap is 50% from disputes
        assertEq(rep.reliabilityScoreBps, 5000); // 100% - 50% (capped) = 50%
    }

    function test_CombinedPenalties() public {
        // 5 disputes = 25% penalty (capped at 50%)
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(disputeManager);
            ledger.recordDispute(robotId);
        }

        // 3 slashes = 30% penalty (capped at 50%)
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(disputeManager);
            ledger.recordSlash(robotId);
        }

        IReputationLedger.ReputationData memory rep = ledger.getReputation(robotId);
        // 25% from disputes + 30% from slashes = 55%, so score = 100% - 55% = 45%
        assertEq(rep.reliabilityScoreBps, 4500);
    }

    function test_JobCompleteUpdatesReputation() public {
        vm.prank(jobEscrow);
        ledger.recordJobComplete(robotId);

        IReputationLedger.ReputationData memory rep = ledger.getReputation(robotId);
        assertEq(rep.totalJobs, 1);
        // Score still 100% with no disputes/slashes
        assertEq(rep.reliabilityScoreBps, 10000);
    }

    function test_RevertWhen_UnauthorizedCaller() public {
        vm.prank(address(0x999));
        vm.expectRevert(Errors.NotAuthorized.selector);
        ledger.recordJobComplete(robotId);

        vm.prank(address(0x999));
        vm.expectRevert(Errors.NotAuthorized.selector);
        ledger.recordDispute(robotId);
    }
}
