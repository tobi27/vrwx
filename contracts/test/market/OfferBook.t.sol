// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/market/OfferBook.sol";
import "../../src/depin/StakingGate.sol";
import "../../src/depin/FeeRouter.sol";
import "../../src/depin/VRWXToken.sol";
import "../../src/mocks/MockERC20.sol";
import "../../src/core/JobEscrow.sol";
import "../../src/core/IdentityRegistry.sol";
import "../../src/core/BondManager.sol";
import "../../src/core/Receipt1155.sol";
import "../../src/core/DisputeManager.sol";

contract OfferBookTest is Test {
    OfferBook public offerBook;
    StakingGate public stakingGate;
    FeeRouter public feeRouter;
    VRWXToken public vrwxToken;
    MockERC20 public stableToken;
    JobEscrow public jobEscrow;
    IdentityRegistry public identity;
    BondManager public bond;
    Receipt1155 public receipt;
    DisputeManager public dispute;

    address public admin;
    address public operator;
    address public buyer;
    bytes32 public robotId = keccak256("robot-1");
    bytes32 public jobSpecHash = keccak256("job-spec-1");

    function setUp() public {
        admin = address(this);
        operator = address(0x1);
        buyer = address(0x2);

        // Deploy tokens
        vrwxToken = new VRWXToken();
        stableToken = new MockERC20();

        // Deploy core contracts
        identity = new IdentityRegistry();
        bond = new BondManager(address(stableToken), address(identity));
        jobEscrow = new JobEscrow(address(stableToken), admin);
        receipt = new Receipt1155();
        dispute = new DisputeManager(address(jobEscrow), address(bond), address(receipt));

        // Configure core contracts
        jobEscrow.setContracts(address(identity), address(bond), address(receipt), address(dispute));
        bond.setJobEscrow(address(jobEscrow));
        bond.setDisputeManager(address(dispute));
        receipt.setJobEscrow(address(jobEscrow));

        // Deploy DePIN contracts
        stakingGate = new StakingGate(address(vrwxToken));
        feeRouter = new FeeRouter(address(vrwxToken), address(stableToken), admin);

        // Grant BURNER_ROLE to FeeRouter
        vrwxToken.grantRole(vrwxToken.BURNER_ROLE(), address(feeRouter));

        // Deploy OfferBook
        offerBook = new OfferBook(address(jobEscrow), address(stableToken));
        offerBook.setStakingGate(address(stakingGate));
        offerBook.setFeeRouter(address(feeRouter));
        feeRouter.setAuthorizedCaller(address(offerBook), true);

        // Authorize OfferBook as a caller in JobEscrow
        jobEscrow.setAuthorizedCaller(address(offerBook), true);

        // Setup operator with robot, bond, and stake
        identity.registerRobot(robotId, operator, "");
        stableToken.mint(operator, 10000 ether);
        vm.startPrank(operator);
        stableToken.approve(address(bond), 5000 ether);
        bond.deposit(robotId, 5000 ether);
        vm.stopPrank();

        // Stake VRWX for operator
        vrwxToken.grantRole(vrwxToken.MINTER_ROLE(), admin);
        vrwxToken.mint(operator, 5000 ether);
        vm.startPrank(operator);
        vrwxToken.approve(address(stakingGate), 2000 ether);
        stakingGate.stake(2000 ether);
        vrwxToken.approve(address(feeRouter), 100 ether); // For listing fees
        vm.stopPrank();

        // Setup buyer
        stableToken.mint(buyer, 10000 ether);
    }

    function test_CreateOfferRequiresStake() public {
        // Create offer from staked operator
        vm.prank(operator);
        uint256 offerId = offerBook.createOffer(robotId, jobSpecHash, 100 ether, 1 days);
        assertEq(offerId, 1);

        IOfferBook.Offer memory offer = offerBook.getOffer(offerId);
        assertEq(offer.operator, operator);
        assertEq(offer.robotId, robotId);
        assertEq(offer.price, 100 ether);
        assertTrue(offer.active);
    }

    function test_CreateOfferBurnsListingFee() public {
        uint256 balanceBefore = vrwxToken.balanceOf(operator);

        vm.prank(operator);
        offerBook.createOffer(robotId, jobSpecHash, 100 ether, 1 days);

        uint256 balanceAfter = vrwxToken.balanceOf(operator);
        // Default listing fee is 10 VRWX
        assertEq(balanceBefore - balanceAfter, 10 ether);
    }

    function test_BuyOfferCreatesJob() public {
        // Create offer
        vm.prank(operator);
        uint256 offerId = offerBook.createOffer(robotId, jobSpecHash, 100 ether, 1 days);

        // Buy offer
        vm.startPrank(buyer);
        stableToken.approve(address(offerBook), 100 ether);
        uint256 jobId = offerBook.buyOffer(offerId);
        vm.stopPrank();

        // Check offer is no longer active
        IOfferBook.Offer memory offer = offerBook.getOffer(offerId);
        assertFalse(offer.active);

        // Check job was created
        JobEscrow.Job memory job = jobEscrow.getJob(jobId);
        assertEq(job.buyer, buyer);
        assertEq(job.robotId, robotId);
        assertEq(job.price, 100 ether);
        assertEq(uint8(job.status), uint8(JobEscrow.Status.FUNDED));
    }

    function test_RevertWhen_CreateOfferWithoutStake() public {
        address unstaked = address(0x999);

        vm.prank(unstaked);
        vm.expectRevert(Errors.InsufficientStake.selector);
        offerBook.createOffer(robotId, jobSpecHash, 100 ether, 1 days);
    }

    function test_RevertWhen_BuyExpiredOffer() public {
        vm.prank(operator);
        uint256 offerId = offerBook.createOffer(robotId, jobSpecHash, 100 ether, 1 days);

        // Fast forward past expiration
        vm.warp(block.timestamp + 2 days);

        vm.startPrank(buyer);
        stableToken.approve(address(offerBook), 100 ether);
        vm.expectRevert(Errors.OfferExpired.selector);
        offerBook.buyOffer(offerId);
        vm.stopPrank();
    }

    function test_CancelOffer() public {
        vm.prank(operator);
        uint256 offerId = offerBook.createOffer(robotId, jobSpecHash, 100 ether, 1 days);

        vm.prank(operator);
        offerBook.cancelOffer(offerId);

        IOfferBook.Offer memory offer = offerBook.getOffer(offerId);
        assertFalse(offer.active);
    }
}
