// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Setup.t.sol";
import "../src/libraries/Errors.sol";
import "../src/interfaces/IDisputeManager.sol";

contract AttacksTest is Setup {
    // Attack 1: Replay Attack - Submit same completion twice to same job
    function test_ReplayAttack() public {
        uint256 jobId = _createAndFundJob();
        bytes32 completionHash = keccak256("completion-data");

        // First submission succeeds
        _submitCompletion(jobId, completionHash);

        // Try to submit same completion to same job again
        JobEscrow.Job memory job = escrow.getJob(jobId);
        bytes memory sig = _signCompletion(
            jobId,
            job.jobSpecHash,
            completionHash, // Same hash as before
            job.robotId,
            robotController,
            job.deadline,
            robotKey
        );

        // Should fail because job status is no longer FUNDED
        vm.expectRevert(Errors.InvalidStatus.selector);
        escrow.submitCompletion(jobId, completionHash, sig);
    }

    // Attack 2: Wrong Zone Attack - GeoCell mismatch leads to dispute and slash
    function test_WrongZoneAttack() public {
        uint256 jobId = _createAndFundJob();

        // Robot submits completion for wrong zone (simulated by different hash)
        bytes32 wrongZoneCompletionHash = keccak256("wrong-zone-data");
        _submitCompletion(jobId, wrongZoneCompletionHash);

        // Buyer notices mismatch and opens dispute
        vm.prank(buyer);
        dispute.openDispute(jobId, keccak256("geoCell-mismatch"));

        uint256 bondedBefore = bond.bonded(robotId);
        uint256 buyerBalanceBefore = token.balanceOf(buyer);

        // Admin verifies and rules FRAUD
        dispute.resolve(jobId, IDisputeManager.Verdict.FRAUD);

        // Bond was slashed
        uint256 slashAmount = (JOB_PRICE * escrow.MIN_BOND_RATIO()) / 10000;
        assertEq(bond.bonded(robotId), bondedBefore - slashAmount);

        // Buyer was refunded + received slashed bond (as challenger)
        assertEq(token.balanceOf(buyer), buyerBalanceBefore + JOB_PRICE + slashAmount);
    }

    // Attack 3: Late Completion Attack - Submit after deadline
    function test_LateCompletionAttack() public {
        uint256 deadline = block.timestamp + 1 hours;

        vm.prank(buyer);
        uint256 jobId = escrow.createJob(jobSpecHash, robotId, JOB_PRICE, deadline);
        vm.prank(buyer);
        escrow.fund(jobId);

        // Warp past deadline
        vm.warp(deadline + 1);

        bytes32 completionHash = keccak256("late-completion");
        JobEscrow.Job memory job = escrow.getJob(jobId);

        bytes memory sig = _signCompletion(
            jobId,
            job.jobSpecHash,
            completionHash,
            job.robotId,
            robotController,
            job.deadline,
            robotKey
        );

        vm.expectRevert(Errors.DeadlinePassed.selector);
        escrow.submitCompletion(jobId, completionHash, sig);
    }

    // Attack 4: Forged Witness Attack - Invalid signature
    function test_ForgedWitnessAttack() public {
        uint256 jobId = _createAndFundJob();
        bytes32 completionHash = keccak256("completion-data");

        JobEscrow.Job memory job = escrow.getJob(jobId);

        // Attacker tries to sign with wrong key
        uint256 attackerKey = 0x999;

        bytes memory forgedSig = _signCompletion(
            jobId,
            job.jobSpecHash,
            completionHash,
            job.robotId,
            robotController, // Claims to be controller
            job.deadline,
            attackerKey // But signs with wrong key
        );

        vm.expectRevert(Errors.InvalidSignature.selector);
        escrow.submitCompletion(jobId, completionHash, forgedSig);
    }

    // Attack 5: Dataset Mismatch Attack - Modify hash after signing
    function test_DatasetMismatchAttack() public {
        uint256 jobId = _createAndFundJob();

        bytes32 originalHash = keccak256("original-data");
        bytes32 modifiedHash = keccak256("modified-data");

        JobEscrow.Job memory job = escrow.getJob(jobId);

        // Sign with original hash
        bytes memory sig = _signCompletion(
            jobId,
            job.jobSpecHash,
            originalHash, // Sign with original
            job.robotId,
            robotController,
            job.deadline,
            robotKey
        );

        // Try to submit with modified hash
        vm.expectRevert(Errors.InvalidSignature.selector);
        escrow.submitCompletion(jobId, modifiedHash, sig); // Submit with modified
    }

    // Bonus: Test slashing results in at least 2 slashings across test suite
    function test_MultipleSlashings() public {
        // First slashing - Wrong Zone
        uint256 jobId1 = _createAndFundJob();
        _submitCompletion(jobId1, keccak256("wrong-zone-1"));
        vm.prank(buyer);
        dispute.openDispute(jobId1, keccak256("slash-1"));
        dispute.resolve(jobId1, IDisputeManager.Verdict.FRAUD);

        // Deposit more bond for second job
        token.mint(robotController, BOND_AMOUNT);
        vm.prank(robotController);
        token.approve(address(bond), BOND_AMOUNT);
        vm.prank(robotController);
        bond.deposit(robotId, BOND_AMOUNT);

        // Second slashing - Non-delivery
        uint256 jobId2 = _createAndFundJob();
        _submitCompletion(jobId2, keccak256("non-delivery-data"));
        vm.prank(buyer);
        dispute.openDispute(jobId2, keccak256("slash-2"));
        dispute.resolve(jobId2, IDisputeManager.Verdict.NON_DELIVERY);

        // Verify both disputes resolved
        assertEq(uint8(dispute.getDispute(jobId1).verdict), uint8(IDisputeManager.Verdict.FRAUD));
        assertEq(uint8(dispute.getDispute(jobId2).verdict), uint8(IDisputeManager.Verdict.NON_DELIVERY));
    }
}
