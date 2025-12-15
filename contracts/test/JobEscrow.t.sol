// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Setup.t.sol";
import "../src/libraries/Errors.sol";

contract JobEscrowTest is Setup {
    function test_CreateJob() public {
        uint256 deadline = block.timestamp + 1 hours;

        vm.prank(buyer);
        uint256 jobId = escrow.createJob(jobSpecHash, robotId, JOB_PRICE, deadline);

        assertEq(jobId, 1);

        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.buyer, buyer);
        assertEq(job.robotId, robotId);
        assertEq(job.jobSpecHash, jobSpecHash);
        assertEq(job.price, JOB_PRICE);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.CREATED));
    }

    function test_FundJob() public {
        uint256 deadline = block.timestamp + 1 hours;

        vm.prank(buyer);
        uint256 jobId = escrow.createJob(jobSpecHash, robotId, JOB_PRICE, deadline);

        uint256 escrowBalanceBefore = token.balanceOf(address(escrow));

        vm.prank(buyer);
        escrow.fund(jobId);

        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.FUNDED));
        assertEq(token.balanceOf(address(escrow)), escrowBalanceBefore + JOB_PRICE);
    }

    function test_SubmitCompletion() public {
        uint256 jobId = _createAndFundJob();
        bytes32 completionHash = keccak256("completion-data");

        _submitCompletion(jobId, completionHash);

        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.COMPLETED));
        assertEq(job.completionHash, completionHash);
        assertTrue(job.settleAfter > block.timestamp);
    }

    function test_Settle() public {
        uint256 jobId = _createAndFundJob();
        bytes32 completionHash = keccak256("completion-data");

        _submitCompletion(jobId, completionHash);

        // Warp past challenge window
        vm.warp(block.timestamp + escrow.CHALLENGE_WINDOW() + 1);

        uint256 treasuryBalanceBefore = token.balanceOf(treasury);
        uint256 controllerBalanceBefore = token.balanceOf(robotController);

        escrow.settle(jobId);

        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.SETTLED));
        assertTrue(job.tokenId != 0);

        // Check fee distribution
        uint256 expectedFee = (JOB_PRICE * escrow.TAU_BPS()) / 10000;
        uint256 expectedPayout = JOB_PRICE - expectedFee;

        assertEq(token.balanceOf(treasury), treasuryBalanceBefore + expectedFee);
        assertEq(token.balanceOf(robotController), controllerBalanceBefore + expectedPayout);

        // Check receipt was minted
        assertTrue(receipt.exists(job.tokenId));
    }

    function test_FullFlow() public {
        // 1. Create job
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(buyer);
        uint256 jobId = escrow.createJob(jobSpecHash, robotId, JOB_PRICE, deadline);

        // 2. Fund job
        vm.prank(buyer);
        escrow.fund(jobId);

        // 3. Submit completion
        bytes32 completionHash = keccak256("dataset-hash");
        _submitCompletion(jobId, completionHash);

        // 4. Wait challenge window
        vm.warp(block.timestamp + escrow.CHALLENGE_WINDOW() + 1);

        // 5. Settle
        escrow.settle(jobId);

        // 6. Verify final state
        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.SETTLED));
        assertTrue(receipt.exists(job.tokenId));

        // 7. Verify bond was unlocked
        uint256 expectedLocked = 0; // All bonds should be unlocked after settlement
        assertEq(bond.locked(robotId), expectedLocked);
    }

    function test_RevertWhen_CreateJobInsufficientBond() public {
        bytes32 newRobotId = keccak256("poor-robot");
        address newController = makeAddr("poorController");
        identity.registerRobot(newRobotId, newController, "");

        // Don't deposit any bond

        vm.prank(buyer);
        vm.expectRevert(Errors.InsufficientBond.selector);
        escrow.createJob(jobSpecHash, newRobotId, JOB_PRICE, block.timestamp + 1 hours);
    }

    function test_RevertWhen_SettleBeforeChallengeWindow() public {
        uint256 jobId = _createAndFundJob();
        bytes32 completionHash = keccak256("completion-data");

        _submitCompletion(jobId, completionHash);

        // Don't warp time - still in challenge window

        vm.expectRevert(Errors.ChallengeWindowActive.selector);
        escrow.settle(jobId);
    }
}
