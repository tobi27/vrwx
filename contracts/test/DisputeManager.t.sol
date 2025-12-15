// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Setup.t.sol";
import "../src/libraries/Errors.sol";
import "../src/interfaces/IDisputeManager.sol";

contract DisputeManagerTest is Setup {
    function test_OpenDispute() public {
        uint256 jobId = _createAndFundJob();
        bytes32 completionHash = keccak256("completion-data");
        _submitCompletion(jobId, completionHash);

        bytes32 reasonHash = keccak256("fraud-reason");

        vm.prank(buyer);
        dispute.openDispute(jobId, reasonHash);

        assertTrue(dispute.hasDispute(jobId));

        IDisputeManager.Dispute memory d = dispute.getDispute(jobId);
        assertEq(d.jobId, jobId);
        assertEq(d.challenger, buyer);
        assertEq(d.reasonHash, reasonHash);
        assertEq(uint8(d.verdict), uint8(IDisputeManager.Verdict.PENDING));

        // Check job status changed to DISPUTED
        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.DISPUTED));
    }

    function test_ResolveFraud() public {
        uint256 jobId = _createAndFundJob();
        bytes32 completionHash = keccak256("completion-data");
        _submitCompletion(jobId, completionHash);

        vm.prank(buyer);
        dispute.openDispute(jobId, keccak256("fraud"));

        uint256 buyerBalanceBefore = token.balanceOf(buyer);
        uint256 bondedBefore = bond.bonded(robotId);

        // Admin resolves as FRAUD
        dispute.resolve(jobId, IDisputeManager.Verdict.FRAUD);

        // Check bond was slashed
        uint256 slashAmount = (JOB_PRICE * escrow.MIN_BOND_RATIO()) / 10000;
        assertEq(bond.bonded(robotId), bondedBefore - slashAmount);

        // Check buyer was refunded + received slashed bond (as challenger)
        assertEq(token.balanceOf(buyer), buyerBalanceBefore + JOB_PRICE + slashAmount);

        // Check verdict
        IDisputeManager.Dispute memory d = dispute.getDispute(jobId);
        assertEq(uint8(d.verdict), uint8(IDisputeManager.Verdict.FRAUD));
    }

    function test_ResolveNonDelivery() public {
        uint256 jobId = _createAndFundJob();
        bytes32 completionHash = keccak256("completion-data");
        _submitCompletion(jobId, completionHash);

        vm.prank(buyer);
        dispute.openDispute(jobId, keccak256("non-delivery"));

        uint256 buyerBalanceBefore = token.balanceOf(buyer);

        dispute.resolve(jobId, IDisputeManager.Verdict.NON_DELIVERY);

        // Check buyer was refunded + received slashed bond (as challenger)
        uint256 slashAmount = (JOB_PRICE * escrow.MIN_BOND_RATIO()) / 10000;
        assertEq(token.balanceOf(buyer), buyerBalanceBefore + JOB_PRICE + slashAmount);

        IDisputeManager.Dispute memory d = dispute.getDispute(jobId);
        assertEq(uint8(d.verdict), uint8(IDisputeManager.Verdict.NON_DELIVERY));
    }

    function test_ResolveValid() public {
        uint256 jobId = _createAndFundJob();
        bytes32 completionHash = keccak256("completion-data");
        _submitCompletion(jobId, completionHash);

        vm.prank(buyer);
        dispute.openDispute(jobId, keccak256("invalid-complaint"));

        uint256 buyerBalanceBefore = token.balanceOf(buyer);
        uint256 bondedBefore = bond.bonded(robotId);

        dispute.resolve(jobId, IDisputeManager.Verdict.VALID);

        // Check buyer was NOT refunded (dispute was invalid)
        assertEq(token.balanceOf(buyer), buyerBalanceBefore);

        // Check bond was NOT slashed
        assertEq(bond.bonded(robotId), bondedBefore);

        IDisputeManager.Dispute memory d = dispute.getDispute(jobId);
        assertEq(uint8(d.verdict), uint8(IDisputeManager.Verdict.VALID));
    }

    function test_RevertWhen_OpenDisputeAfterWindow() public {
        uint256 jobId = _createAndFundJob();
        bytes32 completionHash = keccak256("completion-data");
        _submitCompletion(jobId, completionHash);

        // Warp past challenge window
        vm.warp(block.timestamp + escrow.CHALLENGE_WINDOW() + 1);

        vm.prank(buyer);
        vm.expectRevert(Errors.ChallengeWindowPassed.selector);
        dispute.openDispute(jobId, keccak256("too-late"));
    }

    function test_RevertWhen_OpenDisputeNotBuyer() public {
        uint256 jobId = _createAndFundJob();
        bytes32 completionHash = keccak256("completion-data");
        _submitCompletion(jobId, completionHash);

        vm.prank(robotController);
        vm.expectRevert(Errors.NotAuthorized.selector);
        dispute.openDispute(jobId, keccak256("not-buyer"));
    }

    function test_RevertWhen_ResolveNotAdmin() public {
        uint256 jobId = _createAndFundJob();
        bytes32 completionHash = keccak256("completion-data");
        _submitCompletion(jobId, completionHash);

        vm.prank(buyer);
        dispute.openDispute(jobId, keccak256("reason"));

        vm.prank(buyer);
        vm.expectRevert(Errors.NotAuthorized.selector);
        dispute.resolve(jobId, IDisputeManager.Verdict.FRAUD);
    }
}
