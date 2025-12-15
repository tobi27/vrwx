// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IDisputeManager.sol";
import "../interfaces/IBondManager.sol";
import "../interfaces/IReceipt1155.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../interfaces/IStakingGate.sol";
import "../interfaces/IReputationLedger.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";

interface IJobEscrow {
    enum Status {
        CREATED,
        FUNDED,
        COMPLETED,
        SETTLED,
        DISPUTED,
        REFUNDED
    }

    struct Job {
        address buyer;
        bytes32 robotId;
        bytes32 jobSpecHash;
        uint256 price;
        uint256 deadline;
        Status status;
        bytes32 completionHash;
        uint256 tokenId;
        uint256 settleAfter;
        uint8 qualityScore;
        uint32 workUnits;
    }

    function getJob(uint256 jobId) external view returns (Job memory);
    function refund(uint256 jobId) external;
    function setDisputed(uint256 jobId) external;
    function identity() external view returns (IIdentityRegistry);
}

contract DisputeManager is IDisputeManager {
    IJobEscrow public immutable escrow;
    IBondManager public immutable bond;
    IReceipt1155 public immutable receipt;

    address public admin;
    uint16 public constant MIN_BOND_RATIO = 1000; // Must match JobEscrow

    // DePIN contracts (optional - set to 0 for P0/P1 behavior)
    IStakingGate public stakingGate;
    IReputationLedger public reputationLedger;

    mapping(uint256 => Dispute) private _disputes;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Errors.NotAuthorized();
        _;
    }

    constructor(address _escrow, address _bond, address _receipt) {
        if (_escrow == address(0) || _bond == address(0) || _receipt == address(0)) {
            revert Errors.ZeroAddress();
        }
        escrow = IJobEscrow(_escrow);
        bond = IBondManager(_bond);
        receipt = IReceipt1155(_receipt);
        admin = msg.sender;
    }

    /**
     * @notice Set optional DePIN contracts (set to 0 to disable)
     * @param _stakingGate StakingGate address (0 = disabled)
     * @param _reputationLedger ReputationLedger address (0 = disabled)
     */
    function setDepinContracts(address _stakingGate, address _reputationLedger) external onlyAdmin {
        stakingGate = IStakingGate(_stakingGate);
        reputationLedger = IReputationLedger(_reputationLedger);
    }

    function openDispute(uint256 jobId, bytes32 reasonHash) external {
        IJobEscrow.Job memory job = escrow.getJob(jobId);

        if (job.buyer == address(0)) revert Errors.JobNotFound();
        if (msg.sender != job.buyer) revert Errors.NotAuthorized();
        if (job.status != IJobEscrow.Status.COMPLETED) revert Errors.InvalidStatus();
        if (block.timestamp >= job.settleAfter) revert Errors.ChallengeWindowPassed();
        if (_disputes[jobId].challenger != address(0)) revert Errors.DisputeAlreadyExists();

        _disputes[jobId] = Dispute({
            jobId: jobId,
            challenger: msg.sender,
            reasonHash: reasonHash,
            verdict: Verdict.PENDING,
            createdAt: block.timestamp
        });

        escrow.setDisputed(jobId);

        emit Events.DisputeOpened(jobId, msg.sender, reasonHash);
    }

    function resolve(uint256 jobId, Verdict verdict) external onlyAdmin {
        Dispute storage dispute = _disputes[jobId];

        if (dispute.challenger == address(0)) revert Errors.DisputeNotFound();
        if (dispute.verdict != Verdict.PENDING) revert Errors.InvalidVerdict();
        if (verdict == Verdict.PENDING) revert Errors.InvalidVerdict();

        dispute.verdict = verdict;

        IJobEscrow.Job memory job = escrow.getJob(jobId);

        if (verdict == Verdict.FRAUD || verdict == Verdict.NON_DELIVERY) {
            // Refund buyer
            escrow.refund(jobId);

            // Slash bond
            uint256 slashAmount = (job.price * MIN_BOND_RATIO) / 10000;
            bond.slash(job.robotId, slashAmount, dispute.challenger);

            // Burn receipt if it was somehow minted (shouldn't happen in normal flow)
            if (job.tokenId != 0 && receipt.exists(job.tokenId)) {
                receipt.burn(job.tokenId);
            }

            // DePIN hooks (if enabled)
            if (address(reputationLedger) != address(0)) {
                reputationLedger.recordDispute(job.robotId);
                reputationLedger.recordSlash(job.robotId);
            }

            // Slash VRWX stake (if enabled)
            if (address(stakingGate) != address(0)) {
                address controller = _getController(job.robotId);
                if (controller != address(0)) {
                    stakingGate.slashStakeVRWX(controller, dispute.challenger);
                }
            }
        } else if (verdict == Verdict.VALID) {
            // Dispute was invalid - job continues to settled state
            // The robot keeps the payment, bond is unlocked
            // Note: In this MVP, we don't auto-settle after valid verdict
            // The job remains in DISPUTED status but can be considered valid
        }

        emit Events.DisputeResolved(jobId, uint8(verdict));
    }

    function getDispute(uint256 jobId) external view returns (Dispute memory) {
        return _disputes[jobId];
    }

    function hasDispute(uint256 jobId) external view returns (bool) {
        return _disputes[jobId].challenger != address(0);
    }

    /**
     * @notice Get controller address for a robot
     * @param robotId The robot identifier
     */
    function _getController(bytes32 robotId) internal view returns (address) {
        try escrow.identity().getController(robotId) returns (address controller) {
            return controller;
        } catch {
            return address(0);
        }
    }
}
