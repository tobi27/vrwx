// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../../src/mocks/MockERC20.sol";
import "../../src/core/IdentityRegistry.sol";
import "../../src/core/BondManager.sol";
import "../../src/core/Receipt1155.sol";
import "../../src/core/JobEscrow.sol";
import "../../src/core/DisputeManager.sol";
import "../../src/market/OfferBook.sol";
import "../../src/depin/StakingGate.sol";

/**
 * @title MultiServicesHandler
 * @notice Simplified handler contract for invariant testing
 */
contract MultiServicesHandler is Test {
    MockERC20 public token;
    IdentityRegistry public identity;
    BondManager public bond;
    Receipt1155 public receipt;
    JobEscrow public escrow;
    OfferBook public offerBook;
    StakingGate public stakingGate;

    bytes32 public constant INSPECTION_HASH = keccak256("inspection");

    address public operator;
    address public buyer;
    bytes32 public robotId;

    uint256[] public createdOfferIds;
    uint256[] public createdJobIds;

    constructor(
        address _token,
        address _identity,
        address _bond,
        address _receipt,
        address _escrow,
        address _offerBook,
        address _stakingGate,
        address _operator,
        address _buyer,
        bytes32 _robotId
    ) {
        token = MockERC20(_token);
        identity = IdentityRegistry(_identity);
        bond = BondManager(_bond);
        receipt = Receipt1155(_receipt);
        escrow = JobEscrow(_escrow);
        offerBook = OfferBook(_offerBook);
        stakingGate = StakingGate(_stakingGate);
        operator = _operator;
        buyer = _buyer;
        robotId = _robotId;
    }

    function createOffer(uint256 price) external {
        price = bound(price, 1 ether, 100 ether);

        bytes32 jobSpecHash = keccak256(abi.encodePacked(block.timestamp, price));
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 minBond = price / 10;

        vm.prank(operator);
        try offerBook.createOfferV2(INSPECTION_HASH, robotId, jobSpecHash, price, deadline, minBond) returns (uint256 offerId) {
            createdOfferIds.push(offerId);
        } catch {}
    }

    function buyOffer(uint256 idx) external {
        if (createdOfferIds.length == 0) return;
        idx = bound(idx, 0, createdOfferIds.length - 1);
        uint256 offerId = createdOfferIds[idx];

        IOfferBook.Offer memory offer = offerBook.getOffer(offerId);
        if (!offer.active) return;

        vm.prank(buyer);
        token.approve(address(offerBook), offer.price);

        vm.prank(buyer);
        try offerBook.buyOfferV2(offerId) returns (uint256 jobId) {
            createdJobIds.push(jobId);
        } catch {}
    }

    function getCreatedOfferIds() external view returns (uint256[] memory) {
        return createdOfferIds;
    }

    function getCreatedJobIds() external view returns (uint256[] memory) {
        return createdJobIds;
    }
}

/**
 * @title MultiServicesInvariantTest
 * @notice Invariant tests for multi-service VRWX system
 */
contract MultiServicesInvariantTest is StdInvariant, Test {
    MockERC20 public token;
    IdentityRegistry public identity;
    BondManager public bond;
    Receipt1155 public receipt;
    JobEscrow public escrow;
    DisputeManager public dispute;
    OfferBook public offerBook;
    StakingGate public stakingGate;
    MultiServicesHandler public handler;

    address public treasury;
    address public operator;
    address public buyer;
    bytes32 public robotId;

    bytes32 public constant INSPECTION_HASH = keccak256("inspection");

    function setUp() public {
        treasury = makeAddr("treasury");
        operator = makeAddr("operator");
        buyer = makeAddr("buyer");
        robotId = keccak256("robot-invariant");

        // Deploy
        token = new MockERC20();
        identity = new IdentityRegistry();
        bond = new BondManager(address(token), address(identity));
        receipt = new Receipt1155();
        escrow = new JobEscrow(address(token), treasury);
        dispute = new DisputeManager(address(escrow), address(bond), address(receipt));
        stakingGate = new StakingGate(address(token));
        offerBook = new OfferBook(address(escrow), address(token));

        // Configure
        escrow.setContracts(address(identity), address(bond), address(receipt), address(dispute));
        bond.setJobEscrow(address(escrow));
        bond.setDisputeManager(address(dispute));
        receipt.setJobEscrow(address(escrow));
        receipt.setDisputeManager(address(dispute));
        offerBook.setStakingGate(address(stakingGate));
        escrow.setAuthorizedCaller(address(offerBook), true);
        stakingGate.setMinStakeVRWX(100 ether);

        // Setup operator
        token.mint(operator, 10000 ether);
        vm.startPrank(operator);
        token.approve(address(stakingGate), 5000 ether);
        stakingGate.stake(1000 ether);
        vm.stopPrank();

        // Register robot + fund bond
        identity.registerRobot(robotId, operator, "");
        vm.prank(operator);
        token.approve(address(bond), 500 ether);
        vm.prank(operator);
        bond.deposit(robotId, 500 ether);

        // Fund buyer
        token.mint(buyer, 100000 ether);

        // Deploy handler
        handler = new MultiServicesHandler(
            address(token),
            address(identity),
            address(bond),
            address(receipt),
            address(escrow),
            address(offerBook),
            address(stakingGate),
            operator,
            buyer,
            robotId
        );

        targetContract(address(handler));
    }

    /// @notice Bond integrity: bonded >= locked
    function invariant_bondIntegrity() public view {
        uint256 bondedAmt = bond.bonded(robotId);
        uint256 lockedAmt = bond.locked(robotId);
        assertTrue(bondedAmt >= lockedAmt, "Bond integrity violated");
    }

    /// @notice Stake requirements enforced for offers
    function invariant_stakeRequirement() public view {
        uint256[] memory offerIds = handler.getCreatedOfferIds();
        if (offerIds.length > 0) {
            assertTrue(stakingGate.hasMinStake(operator), "Operator lost stake");
        }
    }

    /// @notice Service type hash consistency
    function invariant_serviceTypeConsistent() public view {
        uint256[] memory offerIds = handler.getCreatedOfferIds();
        for (uint256 i = 0; i < offerIds.length; i++) {
            bytes32 svcType = offerBook.offerServiceTypes(offerIds[i]);
            bool isValid = svcType == INSPECTION_HASH || svcType == bytes32(0);
            assertTrue(isValid, "Invalid service type");
        }
    }

    /// @notice Token conservation
    function invariant_tokenConservation() public view {
        uint256 total = token.totalSupply();
        uint256 escrowBal = token.balanceOf(address(escrow));
        uint256 bondBal = token.balanceOf(address(bond));
        uint256 stakeBal = token.balanceOf(address(stakingGate));

        assertTrue(escrowBal + bondBal + stakeBal <= total, "Token conservation violated");
    }

    /// @notice Quality score bounded (0-255)
    function invariant_qualityScoreBounded() public view {
        uint256[] memory jobIds = handler.getCreatedJobIds();
        for (uint256 i = 0; i < jobIds.length; i++) {
            JobEscrow.Job memory job = escrow.getJob(jobIds[i]);
            assertTrue(job.qualityScore <= 255, "Quality score out of bounds");
        }
    }

    /// @notice Job deadline valid
    function invariant_jobDeadlineValid() public view {
        uint256[] memory jobIds = handler.getCreatedJobIds();
        for (uint256 i = 0; i < jobIds.length; i++) {
            JobEscrow.Job memory job = escrow.getJob(jobIds[i]);
            if (job.price > 0) {
                assertTrue(job.deadline > 0, "Job deadline is zero");
            }
        }
    }
}
