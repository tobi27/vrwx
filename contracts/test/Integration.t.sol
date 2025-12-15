// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/mocks/MockERC20.sol";
import "../src/core/IdentityRegistry.sol";
import "../src/core/BondManager.sol";
import "../src/core/JobEscrow.sol";
import "../src/core/Receipt1155.sol";
import "../src/core/DisputeManager.sol";
import "../src/depin/VRWXToken.sol";
import "../src/depin/RewardsDistributor.sol";
import "../src/depin/ReputationLedger.sol";
import "../src/depin/StakingGate.sol";
import "../src/depin/FeeRouter.sol";
import "../src/market/OfferBook.sol";
import "../src/libraries/EIP712Types.sol";

contract IntegrationTest is Test {
    // Core contracts
    MockERC20 public stableToken;
    IdentityRegistry public identity;
    BondManager public bond;
    JobEscrow public jobEscrow;
    Receipt1155 public receipt;
    DisputeManager public dispute;

    // DePIN contracts
    VRWXToken public vrwxToken;
    RewardsDistributor public rewardsDistributor;
    ReputationLedger public reputationLedger;
    StakingGate public stakingGate;
    FeeRouter public feeRouter;
    OfferBook public offerBook;

    // Actors
    address public admin;
    address public treasury;
    address public operator;
    uint256 public operatorKey;
    address public buyer;
    bytes32 public robotId;
    bytes32 public jobSpecHash = keccak256("delivery-job-spec");

    function setUp() public {
        admin = address(this);
        treasury = address(0x100);
        (operator, operatorKey) = makeAddrAndKey("operator");
        buyer = address(0x2);
        robotId = keccak256("robot-1");

        // Deploy tokens
        stableToken = new MockERC20();
        vrwxToken = new VRWXToken();

        // Deploy core contracts
        identity = new IdentityRegistry();
        bond = new BondManager(address(stableToken), address(identity));
        jobEscrow = new JobEscrow(address(stableToken), treasury);
        receipt = new Receipt1155();
        dispute = new DisputeManager(address(jobEscrow), address(bond), address(receipt));

        // Configure core
        jobEscrow.setContracts(address(identity), address(bond), address(receipt), address(dispute));
        bond.setJobEscrow(address(jobEscrow));
        bond.setDisputeManager(address(dispute));
        receipt.setJobEscrow(address(jobEscrow));

        // Deploy DePIN contracts
        reputationLedger = new ReputationLedger();
        rewardsDistributor = new RewardsDistributor(address(vrwxToken));
        stakingGate = new StakingGate(address(vrwxToken));
        feeRouter = new FeeRouter(address(vrwxToken), address(stableToken), treasury);

        // Configure DePIN
        reputationLedger.setJobEscrow(address(jobEscrow));
        reputationLedger.setDisputeManager(address(dispute));
        rewardsDistributor.setJobEscrow(address(jobEscrow));
        rewardsDistributor.setReputationLedger(address(reputationLedger));
        stakingGate.setDisputeManager(address(dispute));

        // Grant roles
        vrwxToken.grantRole(vrwxToken.MINTER_ROLE(), address(rewardsDistributor));
        vrwxToken.grantRole(vrwxToken.BURNER_ROLE(), address(feeRouter));
        vrwxToken.grantRole(vrwxToken.BURNER_ROLE(), address(stakingGate));
        feeRouter.setAuthorizedCaller(address(jobEscrow), true);

        // Enable DePIN in JobEscrow
        jobEscrow.setDepinContracts(address(rewardsDistributor), address(reputationLedger), address(feeRouter));
        dispute.setDepinContracts(address(stakingGate), address(reputationLedger));

        // Deploy OfferBook
        offerBook = new OfferBook(address(jobEscrow), address(stableToken));
        offerBook.setStakingGate(address(stakingGate));
        offerBook.setFeeRouter(address(feeRouter));
        feeRouter.setAuthorizedCaller(address(offerBook), true);
        jobEscrow.setAuthorizedCaller(address(offerBook), true);

        // Setup operator
        identity.registerRobot(robotId, operator, "");
        stableToken.mint(operator, 10000 ether);
        vm.startPrank(operator);
        stableToken.approve(address(bond), 5000 ether);
        bond.deposit(robotId, 5000 ether);
        vm.stopPrank();

        // Setup buyer
        stableToken.mint(buyer, 10000 ether);

        // Setup operator VRWX stake
        vrwxToken.grantRole(vrwxToken.MINTER_ROLE(), admin); // For test setup
        vrwxToken.mint(operator, 5000 ether);
        vm.startPrank(operator);
        vrwxToken.approve(address(stakingGate), 2000 ether);
        stakingGate.stake(2000 ether);
        vrwxToken.approve(address(feeRouter), 100 ether);
        vm.stopPrank();
    }

    function test_FullDePINFlow() public {
        // 1. Operator creates offer
        vm.prank(operator);
        uint256 offerId = offerBook.createOffer(robotId, jobSpecHash, 100 ether, 1 days);

        // 2. Buyer purchases offer
        vm.startPrank(buyer);
        stableToken.approve(address(offerBook), 100 ether);
        uint256 jobId = offerBook.buyOffer(offerId);
        vm.stopPrank();

        // 3. Operator completes job with V2 claim
        bytes32 completionHash = keccak256("completion-data");
        uint8 qualityScore = 100;
        uint32 workUnits = 5;

        EIP712Types.CompletionClaimV2 memory claim = EIP712Types.CompletionClaimV2({
            jobId: jobId,
            jobSpecHash: jobSpecHash,
            completionHash: completionHash,
            robotId: robotId,
            controller: operator,
            deadline: block.timestamp + 7 days,
            qualityScore: qualityScore,
            workUnits: workUnits
        });

        bytes32 structHash = EIP712Types.hashCompletionClaimV2(claim);
        bytes32 digest = jobEscrow.hashTypedDataV4(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        jobEscrow.submitCompletionV2(jobId, completionHash, qualityScore, workUnits, signature);

        // 4. Wait for challenge window
        vm.warp(block.timestamp + 1 days + 1);

        // 5. Settle the job
        uint256 vrwxBefore = vrwxToken.balanceOf(operator);
        jobEscrow.settle(jobId);
        uint256 vrwxAfter = vrwxToken.balanceOf(operator);

        // 6. Verify VRWX was minted
        // Expected: 100 VRWX * 5 workUnits * 1.0 quality * 1.5 reliability (new robot) = 750 VRWX
        uint256 minted = vrwxAfter - vrwxBefore;
        assertEq(minted, 750 ether);

        // 7. Verify reputation was updated
        IReputationLedger.ReputationData memory rep = reputationLedger.getReputation(robotId);
        assertEq(rep.totalJobs, 1);
    }

    function test_DisputeSlashesVRWXStake() public {
        // Create and buy offer
        vm.prank(operator);
        uint256 offerId = offerBook.createOffer(robotId, jobSpecHash, 100 ether, 1 days);

        vm.startPrank(buyer);
        stableToken.approve(address(offerBook), 100 ether);
        uint256 jobId = offerBook.buyOffer(offerId);
        vm.stopPrank();

        // Submit completion
        bytes32 completionHash = keccak256("completion-data");
        EIP712Types.CompletionClaim memory claim = EIP712Types.CompletionClaim({
            jobId: jobId,
            jobSpecHash: jobSpecHash,
            completionHash: completionHash,
            robotId: robotId,
            controller: operator,
            deadline: block.timestamp + 7 days
        });

        bytes32 structHash = EIP712Types.hashCompletionClaim(claim);
        bytes32 digest = jobEscrow.hashTypedDataV4(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        jobEscrow.submitCompletion(jobId, completionHash, signature);

        // Open dispute
        vm.prank(buyer);
        dispute.openDispute(jobId, keccak256("fraud-reason"));

        // Record operator stake before
        IStakingGate.StakeData memory stakeBefore = stakingGate.getStake(operator);

        // Resolve as fraud
        dispute.resolve(jobId, IDisputeManager.Verdict.FRAUD);

        // Check VRWX stake was slashed
        IStakingGate.StakeData memory stakeAfter = stakingGate.getStake(operator);
        // 25% slash: 2000 * 0.25 = 500 VRWX slashed
        assertEq(stakeBefore.staked - stakeAfter.staked, 500 ether);

        // Check buyer received slashed tokens
        assertEq(vrwxToken.balanceOf(buyer), 500 ether);

        // Check reputation was affected
        IReputationLedger.ReputationData memory rep = reputationLedger.getReputation(robotId);
        assertEq(rep.totalDisputes, 1);
        assertEq(rep.totalSlashes, 1);
    }

    function test_BackwardsCompatibility() public {
        // Disable all DePIN contracts
        jobEscrow.setDepinContracts(address(0), address(0), address(0));
        dispute.setDepinContracts(address(0), address(0));

        // Create job normally (not through OfferBook)
        vm.prank(buyer);
        uint256 jobId = jobEscrow.createJob(jobSpecHash, robotId, 100 ether, block.timestamp + 7 days);

        vm.prank(buyer);
        stableToken.approve(address(jobEscrow), 100 ether);
        vm.prank(buyer);
        jobEscrow.fund(jobId);

        // Submit completion using V1 (no quality/workUnits)
        bytes32 completionHash = keccak256("completion-data");
        EIP712Types.CompletionClaim memory claim = EIP712Types.CompletionClaim({
            jobId: jobId,
            jobSpecHash: jobSpecHash,
            completionHash: completionHash,
            robotId: robotId,
            controller: operator,
            deadline: block.timestamp + 7 days
        });

        bytes32 structHash = EIP712Types.hashCompletionClaim(claim);
        bytes32 digest = jobEscrow.hashTypedDataV4(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        jobEscrow.submitCompletion(jobId, completionHash, signature);

        // Wait and settle
        vm.warp(block.timestamp + 1 days + 1);
        uint256 vrwxBefore = vrwxToken.totalSupply();
        jobEscrow.settle(jobId);
        uint256 vrwxAfter = vrwxToken.totalSupply();

        // No VRWX should be minted (depin disabled)
        assertEq(vrwxAfter, vrwxBefore);

        // Job should be settled normally
        JobEscrow.Job memory job = jobEscrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.SETTLED));
    }
}
