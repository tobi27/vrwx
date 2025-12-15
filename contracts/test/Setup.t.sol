// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/mocks/MockERC20.sol";
import "../src/core/IdentityRegistry.sol";
import "../src/core/BondManager.sol";
import "../src/core/Receipt1155.sol";
import "../src/core/JobEscrow.sol";
import "../src/core/DisputeManager.sol";
import "../src/libraries/EIP712Types.sol";

contract Setup is Test {
    MockERC20 public token;
    IdentityRegistry public identity;
    BondManager public bond;
    Receipt1155 public receipt;
    JobEscrow public escrow;
    DisputeManager public dispute;

    address public admin;
    address public treasury;
    address public buyer;
    address public robotController;

    uint256 public buyerKey;
    uint256 public robotKey;

    bytes32 public robotId;
    bytes32 public jobSpecHash;

    uint256 public constant BOND_AMOUNT = 200 ether;
    uint256 public constant JOB_PRICE = 1000 ether;

    function setUp() public virtual {
        // Setup accounts
        admin = address(this);
        treasury = makeAddr("treasury");

        buyerKey = 0x1;
        robotKey = 0x2;
        buyer = vm.addr(buyerKey);
        robotController = vm.addr(robotKey);

        robotId = keccak256("robot-001");
        jobSpecHash = keccak256(abi.encode("inspection", "zone-alpha", block.timestamp));

        // Deploy contracts
        token = new MockERC20();
        identity = new IdentityRegistry();
        bond = new BondManager(address(token), address(identity));
        receipt = new Receipt1155();
        escrow = new JobEscrow(address(token), treasury);
        dispute = new DisputeManager(address(escrow), address(bond), address(receipt));

        // Configure contracts
        escrow.setContracts(address(identity), address(bond), address(receipt), address(dispute));
        bond.setJobEscrow(address(escrow));
        bond.setDisputeManager(address(dispute));
        receipt.setJobEscrow(address(escrow));
        receipt.setDisputeManager(address(dispute));

        // Setup robot
        identity.registerRobot(robotId, robotController, "");

        // Fund and approve for robot bond
        token.mint(robotController, BOND_AMOUNT);
        vm.prank(robotController);
        token.approve(address(bond), BOND_AMOUNT);
        vm.prank(robotController);
        bond.deposit(robotId, BOND_AMOUNT);

        // Fund buyer
        token.mint(buyer, JOB_PRICE * 10);
        vm.prank(buyer);
        token.approve(address(escrow), JOB_PRICE * 10);
    }

    function _signCompletion(
        uint256 jobId,
        bytes32 _jobSpecHash,
        bytes32 completionHash,
        bytes32 _robotId,
        address controller,
        uint256 deadline,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        EIP712Types.CompletionClaim memory claim = EIP712Types.CompletionClaim({
            jobId: jobId,
            jobSpecHash: _jobSpecHash,
            completionHash: completionHash,
            robotId: _robotId,
            controller: controller,
            deadline: deadline
        });

        bytes32 structHash = EIP712Types.hashCompletionClaim(claim);
        bytes32 digest = escrow.hashTypedDataV4(structHash);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _createAndFundJob() internal returns (uint256 jobId) {
        uint256 deadline = block.timestamp + 1 hours;

        vm.prank(buyer);
        jobId = escrow.createJob(jobSpecHash, robotId, JOB_PRICE, deadline);

        vm.prank(buyer);
        escrow.fund(jobId);
    }

    function _submitCompletion(uint256 jobId, bytes32 completionHash) internal {
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

        escrow.submitCompletion(jobId, completionHash, sig);
    }
}
