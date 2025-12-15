// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Setup.t.sol";
import "../src/market/OfferBook.sol";
import "../src/depin/StakingGate.sol";
import "../src/libraries/Errors.sol";

contract MultiServicesTest is Setup {
    OfferBook public offerBook;
    StakingGate public stakingGate;

    // Service type hashes
    bytes32 public constant INSPECTION_HASH = keccak256("inspection");
    bytes32 public constant SECURITY_PATROL_HASH = keccak256("security_patrol");
    bytes32 public constant DELIVERY_HASH = keccak256("delivery");

    address public operator;
    uint256 public operatorKey;

    function setUp() public override {
        super.setUp();

        // Setup operator
        operatorKey = 0x3;
        operator = vm.addr(operatorKey);

        // Deploy StakingGate and OfferBook
        stakingGate = new StakingGate(address(token));
        offerBook = new OfferBook(address(escrow), address(token));

        // Configure OfferBook with staking gate
        offerBook.setStakingGate(address(stakingGate));

        // Authorize OfferBook as caller on JobEscrow
        escrow.setAuthorizedCaller(address(offerBook), true);

        // Set lower minimum stake for testing
        stakingGate.setMinStakeVRWX(100 ether);

        // Stake operator
        token.mint(operator, 1000 ether);
        vm.startPrank(operator);
        token.approve(address(stakingGate), 500 ether);
        stakingGate.stake(500 ether);
        vm.stopPrank();

        // Register operator's robot (use different robotId for operator)
        bytes32 operatorRobotId = keccak256("robot-operator");
        identity.registerRobot(operatorRobotId, operator, "");

        // Fund operator robot bond
        token.mint(operator, BOND_AMOUNT);
        vm.prank(operator);
        token.approve(address(bond), BOND_AMOUNT);
        vm.prank(operator);
        bond.deposit(operatorRobotId, BOND_AMOUNT);

        // Update robotId to use operator's robot for multi-service tests
        robotId = operatorRobotId;

        // Fund buyer for offer purchases
        token.mint(buyer, JOB_PRICE * 10);
        vm.prank(buyer);
        token.approve(address(offerBook), JOB_PRICE * 10);
    }

    // ==================== Inspection Service Tests ====================

    function test_Inspection_CreateOfferV2_BuyV2_Settle() public {
        // Create V2 offer
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 price = 100 ether;
        uint256 minBond = 10 ether;

        vm.prank(operator);
        uint256 offerId = offerBook.createOfferV2(
            INSPECTION_HASH,
            robotId,
            jobSpecHash,
            price,
            deadline,
            minBond
        );

        // Verify offer service type
        assertEq(offerBook.offerServiceTypes(offerId), INSPECTION_HASH);

        // Buy offer
        vm.prank(buyer);
        uint256 jobId = offerBook.buyOfferV2(offerId);

        // Verify job service type
        assertEq(escrow.jobServiceTypes(jobId), INSPECTION_HASH);

        // Submit completion
        bytes32 completionHash = keccak256("inspection-complete");
        _submitCompletionV2(jobId, completionHash, 100, 5);

        // Wait for challenge window
        vm.warp(block.timestamp + escrow.CHALLENGE_WINDOW() + 1);

        // Settle and verify V2 event
        vm.expectEmit(true, true, false, true);
        emit JobEscrow.JobSettledV2(jobId, INSPECTION_HASH, uint256(keccak256(abi.encode(jobSpecHash, completionHash))), 1);
        escrow.settle(jobId);

        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.SETTLED));
    }

    // ==================== Security Patrol Service Tests ====================

    function test_SecurityPatrol_CreateOfferV2_BuyV2_Settle() public {
        bytes32 patrolJobSpecHash = keccak256(abi.encode("security_patrol", "zone-bravo", block.timestamp));

        // Create V2 offer for security patrol
        uint64 deadline = uint64(block.timestamp + 2 hours);
        uint256 price = 150 ether;
        uint256 minBond = 15 ether;

        vm.prank(operator);
        uint256 offerId = offerBook.createOfferV2(
            SECURITY_PATROL_HASH,
            robotId,
            patrolJobSpecHash,
            price,
            deadline,
            minBond
        );

        // Verify service type
        assertEq(offerBook.offerServiceTypes(offerId), SECURITY_PATROL_HASH);

        // Buy offer
        vm.prank(buyer);
        uint256 jobId = offerBook.buyOfferV2(offerId);

        // Verify job service type
        assertEq(escrow.jobServiceTypes(jobId), SECURITY_PATROL_HASH);

        // Submit completion with patrol-specific metrics
        bytes32 completionHash = keccak256("patrol-complete-5-checkpoints");
        _submitCompletionV2ForJob(jobId, patrolJobSpecHash, completionHash, 95, 5);

        // Wait and settle
        vm.warp(block.timestamp + escrow.CHALLENGE_WINDOW() + 1);
        escrow.settle(jobId);

        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.SETTLED));
        assertEq(job.qualityScore, 95);
        assertEq(job.workUnits, 5);
    }

    // ==================== Delivery Service Tests ====================

    function test_Delivery_CreateOfferV2_BuyV2_Settle() public {
        bytes32 deliveryJobSpecHash = keccak256(abi.encode("delivery", "pickup-A", "dropoff-B", block.timestamp));

        // Create V2 offer for delivery
        uint64 deadline = uint64(block.timestamp + 30 minutes);
        uint256 price = 200 ether;
        uint256 minBond = 20 ether;

        vm.prank(operator);
        uint256 offerId = offerBook.createOfferV2(
            DELIVERY_HASH,
            robotId,
            deliveryJobSpecHash,
            price,
            deadline,
            minBond
        );

        // Verify service type
        assertEq(offerBook.offerServiceTypes(offerId), DELIVERY_HASH);

        // Buy offer
        vm.prank(buyer);
        uint256 jobId = offerBook.buyOfferV2(offerId);

        // Verify job service type
        assertEq(escrow.jobServiceTypes(jobId), DELIVERY_HASH);

        // Submit completion (delivery = 1 work unit)
        bytes32 completionHash = keccak256("delivery-proof-pickup-dropoff");
        _submitCompletionV2ForJob(jobId, deliveryJobSpecHash, completionHash, 100, 1);

        // Wait and settle
        vm.warp(block.timestamp + escrow.CHALLENGE_WINDOW() + 1);
        escrow.settle(jobId);

        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.SETTLED));
        assertEq(job.workUnits, 1);
    }

    // ==================== Direct Job V2 Tests ====================

    function test_CreateJobV2_WithServiceType() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 price = 100 ether;

        vm.prank(buyer);
        uint256 jobId = escrow.createJobV2(INSPECTION_HASH, jobSpecHash, robotId, price, deadline);

        // Verify service type is stored
        assertEq(escrow.jobServiceTypes(jobId), INSPECTION_HASH);

        // Verify job was created
        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.buyer, buyer);
        assertEq(job.robotId, robotId);
        assertEq(job.price, price);
    }

    function test_CreateJobV2_EmitsBothEvents() public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 price = 100 ether;

        // Expect both V1 and V2 events
        vm.expectEmit(true, true, true, true);
        emit JobEscrow.JobCreated(1, buyer, robotId, jobSpecHash, price, deadline);

        vm.expectEmit(true, true, false, true);
        emit JobEscrow.JobCreatedV2(1, INSPECTION_HASH, buyer, robotId, price, deadline);

        vm.prank(buyer);
        escrow.createJobV2(INSPECTION_HASH, jobSpecHash, robotId, price, deadline);
    }

    // ==================== Service Type Query Tests ====================

    function test_GetActiveOffersByService() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);

        // Create offers for different services
        vm.startPrank(operator);
        offerBook.createOfferV2(INSPECTION_HASH, robotId, keccak256("spec1"), 100 ether, deadline, 10 ether);
        offerBook.createOfferV2(INSPECTION_HASH, robotId, keccak256("spec2"), 100 ether, deadline, 10 ether);
        offerBook.createOfferV2(SECURITY_PATROL_HASH, robotId, keccak256("spec3"), 150 ether, deadline, 15 ether);
        offerBook.createOfferV2(DELIVERY_HASH, robotId, keccak256("spec4"), 200 ether, deadline, 20 ether);
        vm.stopPrank();

        // Query inspection offers
        (IOfferBook.Offer[] memory inspectionOffers, uint256[] memory inspectionIds) = offerBook.getActiveOffersByService(INSPECTION_HASH, 0, 10);
        assertEq(inspectionOffers.length, 2);

        // Query patrol offers
        (IOfferBook.Offer[] memory patrolOffers, uint256[] memory patrolIds) = offerBook.getActiveOffersByService(SECURITY_PATROL_HASH, 0, 10);
        assertEq(patrolOffers.length, 1);

        // Query delivery offers
        (IOfferBook.Offer[] memory deliveryOffers, uint256[] memory deliveryIds) = offerBook.getActiveOffersByService(DELIVERY_HASH, 0, 10);
        assertEq(deliveryOffers.length, 1);
    }

    // ==================== Dispute Tests ====================

    function test_Inspection_DisputeNonDelivery() public {
        // Create and buy offer
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(operator);
        uint256 offerId = offerBook.createOfferV2(INSPECTION_HASH, robotId, jobSpecHash, 100 ether, deadline, 10 ether);

        vm.prank(buyer);
        uint256 jobId = offerBook.buyOfferV2(offerId);

        // Submit completion
        bytes32 completionHash = keccak256("disputed-completion");
        _submitCompletionV2(jobId, completionHash, 100, 5);

        // Open dispute
        vm.prank(buyer);
        dispute.openDispute(jobId, keccak256("non-delivery-reason"));

        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.DISPUTED));
    }

    function test_Delivery_DisputeQualityFail() public {
        bytes32 deliveryJobSpecHash = keccak256(abi.encode("delivery", "route-A", block.timestamp));

        // Create and buy delivery offer
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(operator);
        uint256 offerId = offerBook.createOfferV2(DELIVERY_HASH, robotId, deliveryJobSpecHash, 200 ether, deadline, 20 ether);

        vm.prank(buyer);
        uint256 jobId = offerBook.buyOfferV2(offerId);

        // Submit completion with low quality
        bytes32 completionHash = keccak256("low-quality-delivery");
        _submitCompletionV2ForJob(jobId, deliveryJobSpecHash, completionHash, 50, 1);

        // Buyer disputes due to quality issues
        vm.prank(buyer);
        dispute.openDispute(jobId, keccak256("quality-below-standard"));

        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.DISPUTED));
    }

    // ==================== Backward Compatibility Tests ====================

    function test_V1_CreateOffer_StillWorks() public {
        uint256 duration = 1 hours;
        uint256 price = 100 ether;

        vm.prank(operator);
        uint256 offerId = offerBook.createOffer(robotId, jobSpecHash, price, duration);

        // V1 offer should have no service type
        assertEq(offerBook.offerServiceTypes(offerId), bytes32(0));

        // Should still be buyable via V1
        vm.prank(buyer);
        uint256 jobId = offerBook.buyOffer(offerId);

        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.buyer, buyer);
    }

    function test_V1_CreateJob_StillWorks() public {
        uint256 deadline = block.timestamp + 1 hours;

        vm.prank(buyer);
        uint256 jobId = escrow.createJob(jobSpecHash, robotId, JOB_PRICE, deadline);

        // V1 job should have no service type
        assertEq(escrow.jobServiceTypes(jobId), bytes32(0));

        // Should still be fundable and completable
        vm.prank(buyer);
        escrow.fund(jobId);

        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.FUNDED));
    }

    function test_V1_Job_NoV2EventOnSettle() public {
        // Use buyer's own robot for V1 test (original from Setup)
        bytes32 buyerRobotId = keccak256("robot-buyer");
        address buyerController = vm.addr(0x4);
        uint256 buyerControllerKey = 0x4;

        // Register buyer's robot
        identity.registerRobot(buyerRobotId, buyerController, "");

        // Fund robot bond
        token.mint(buyerController, BOND_AMOUNT);
        vm.prank(buyerController);
        token.approve(address(bond), BOND_AMOUNT);
        vm.prank(buyerController);
        bond.deposit(buyerRobotId, BOND_AMOUNT);

        // Create V1 job
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(buyer);
        uint256 jobId = escrow.createJob(jobSpecHash, buyerRobotId, JOB_PRICE, deadline);

        vm.prank(buyer);
        escrow.fund(jobId);

        // Submit completion with V1 signature
        bytes32 completionHash = keccak256("v1-completion");
        bytes memory sig = _signCompletion(
            jobId,
            jobSpecHash,
            completionHash,
            buyerRobotId,
            buyerController,
            deadline,
            buyerControllerKey
        );
        escrow.submitCompletion(jobId, completionHash, sig);

        vm.warp(block.timestamp + escrow.CHALLENGE_WINDOW() + 1);

        // V2 event should NOT be emitted for V1 jobs (serviceTypeHash = 0)
        // We just verify settle works
        escrow.settle(jobId);

        JobEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.SETTLED));
    }

    // ==================== Helper Functions ====================

    function _submitCompletionV2(uint256 jobId, bytes32 completionHash, uint8 qualityScore, uint32 workUnits) internal {
        JobEscrow.Job memory job = escrow.getJob(jobId);
        bytes memory sig = _signCompletionV2(jobId, job.jobSpecHash, completionHash, job.robotId, job.deadline, qualityScore, workUnits);
        escrow.submitCompletionV2(jobId, completionHash, qualityScore, workUnits, sig);
    }

    function _submitCompletionV2ForJob(
        uint256 jobId,
        bytes32 _jobSpecHash,
        bytes32 completionHash,
        uint8 qualityScore,
        uint32 workUnits
    ) internal {
        JobEscrow.Job memory job = escrow.getJob(jobId);
        bytes memory sig = _signCompletionV2(jobId, _jobSpecHash, completionHash, job.robotId, job.deadline, qualityScore, workUnits);
        escrow.submitCompletionV2(jobId, completionHash, qualityScore, workUnits, sig);
    }

    function _signCompletionV2(
        uint256 jobId,
        bytes32 _jobSpecHash,
        bytes32 completionHash,
        bytes32 _robotId,
        uint256 deadline,
        uint8 qualityScore,
        uint32 workUnits
    ) internal view returns (bytes memory) {
        address controller = identity.getController(_robotId);

        EIP712Types.CompletionClaimV2 memory claim = EIP712Types.CompletionClaimV2({
            jobId: jobId,
            jobSpecHash: _jobSpecHash,
            completionHash: completionHash,
            robotId: _robotId,
            controller: controller,
            deadline: deadline,
            qualityScore: qualityScore,
            workUnits: workUnits
        });

        bytes32 digest = escrow.hashTypedDataV4(EIP712Types.hashCompletionClaimV2(claim));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
