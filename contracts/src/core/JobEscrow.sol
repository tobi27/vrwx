// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../interfaces/IBondManager.sol";
import "../interfaces/IReceipt1155.sol";
import "../interfaces/IRewardsDistributor.sol";
import "../interfaces/IReputationLedger.sol";
import "../interfaces/IFeeRouter.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";
import "../libraries/EIP712Types.sol";

contract JobEscrow is EIP712 {
    using SafeERC20 for IERC20;

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

    // Constants
    uint16 public constant TAU_BPS = 250; // 2.5%
    uint256 public constant CHALLENGE_WINDOW = 86400; // 24 hours
    uint16 public constant MIN_BOND_RATIO = 1000; // 10%

    // Immutables
    IERC20 public immutable token;

    // State
    address public treasury;
    address public admin;
    address public disputeManager;

    IIdentityRegistry public identity;
    IBondManager public bond;
    IReceipt1155 public receipt;

    // DePIN contracts (optional - set to 0 for P0/P1 behavior)
    IRewardsDistributor public rewardsDistributor;
    IReputationLedger public reputationLedger;
    IFeeRouter public feeRouter;

    uint256 public jobCount;
    mapping(uint256 => Job) public jobs;
    mapping(bytes32 => bool) public claimUsed; // Anti-replay
    mapping(address => bool) public authorizedCallers; // For OfferBook integration

    // V2: Service type tracking for multi-service jobs
    mapping(uint256 => bytes32) public jobServiceTypes;

    // Events
    event JobCreated(
        uint256 indexed jobId,
        address indexed buyer,
        bytes32 indexed robotId,
        bytes32 jobSpecHash,
        uint256 price,
        uint256 deadline
    );
    event JobFunded(uint256 indexed jobId, uint256 amount);
    event CompletionSubmitted(uint256 indexed jobId, bytes32 completionHash);
    event JobSettled(uint256 indexed jobId, uint256 tokenId, uint256 payout, uint256 fee);

    // V2 Events (Multi-Service)
    event JobCreatedV2(
        uint256 indexed jobId,
        bytes32 indexed serviceTypeHash,
        address buyer,
        bytes32 robotId,
        uint256 price,
        uint256 deadline
    );
    event JobSettledV2(
        uint256 indexed jobId,
        bytes32 indexed serviceTypeHash,
        uint256 receiptTokenId,
        uint8 outcome
    );

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyDisputeManager() {
        if (msg.sender != disputeManager) revert Errors.NotAuthorized();
        _;
    }

    constructor(address _token, address _treasury) EIP712("VRWX", "1") {
        if (_token == address(0) || _treasury == address(0)) revert Errors.ZeroAddress();
        token = IERC20(_token);
        treasury = _treasury;
        admin = msg.sender;
    }

    function setContracts(address _identity, address _bond, address _receipt, address _dispute) external onlyAdmin {
        if (_identity == address(0) || _bond == address(0) || _receipt == address(0) || _dispute == address(0)) {
            revert Errors.ZeroAddress();
        }
        identity = IIdentityRegistry(_identity);
        bond = IBondManager(_bond);
        receipt = IReceipt1155(_receipt);
        disputeManager = _dispute;
    }

    /**
     * @notice Set optional DePIN contracts (set to 0 to disable)
     * @param _rewards RewardsDistributor address (0 = disabled)
     * @param _reputation ReputationLedger address (0 = disabled)
     * @param _fees FeeRouter address (0 = disabled)
     */
    function setDepinContracts(address _rewards, address _reputation, address _fees) external onlyAdmin {
        rewardsDistributor = IRewardsDistributor(_rewards);
        reputationLedger = IReputationLedger(_reputation);
        feeRouter = IFeeRouter(_fees);
    }

    /**
     * @notice Set authorized caller status (for OfferBook integration)
     */
    function setAuthorizedCaller(address caller, bool authorized) external onlyAdmin {
        authorizedCallers[caller] = authorized;
    }

    /**
     * @notice Create and fund a job on behalf of a buyer (for OfferBook)
     * @dev Only callable by authorized callers (e.g., OfferBook)
     * @param buyer The actual buyer of the job
     * @param jobSpecHash Hash of the job specification
     * @param robotId Robot identifier
     * @param price Job price
     * @param deadline Job deadline
     */
    function createAndFundJobFor(
        address buyer,
        bytes32 jobSpecHash,
        bytes32 robotId,
        uint256 price,
        uint256 deadline
    ) external returns (uint256 jobId) {
        if (!authorizedCallers[msg.sender]) revert Errors.NotAuthorized();
        if (buyer == address(0)) revert Errors.ZeroAddress();
        if (price == 0) revert Errors.ZeroAmount();
        if (deadline <= block.timestamp) revert Errors.DeadlinePassed();

        // Check robot has sufficient bond
        uint256 minBond = (price * MIN_BOND_RATIO) / 10000;
        if (bond.available(robotId) < minBond) revert Errors.InsufficientBond();

        jobId = ++jobCount;
        jobs[jobId] = Job({
            buyer: buyer,
            robotId: robotId,
            jobSpecHash: jobSpecHash,
            price: price,
            deadline: deadline,
            status: Status.FUNDED, // Already funded
            completionHash: bytes32(0),
            tokenId: 0,
            settleAfter: 0,
            qualityScore: 0,
            workUnits: 0
        });

        // Lock bond
        bond.lock(robotId, minBond);

        // Transfer funds from the authorized caller (OfferBook)
        token.safeTransferFrom(msg.sender, address(this), price);

        emit JobCreated(jobId, buyer, robotId, jobSpecHash, price, deadline);
        emit JobFunded(jobId, price);
    }

    /**
     * @notice Create and fund a V2 job on behalf of a buyer with service type (for OfferBook)
     * @dev Only callable by authorized callers (e.g., OfferBook)
     * @param buyer The actual buyer of the job
     * @param serviceTypeHash Hash of the service type
     * @param jobSpecHash Hash of the job specification
     * @param robotId Robot identifier
     * @param price Job price
     * @param deadline Job deadline
     */
    function createAndFundJobV2For(
        address buyer,
        bytes32 serviceTypeHash,
        bytes32 jobSpecHash,
        bytes32 robotId,
        uint256 price,
        uint256 deadline
    ) external returns (uint256 jobId) {
        if (!authorizedCallers[msg.sender]) revert Errors.NotAuthorized();
        if (buyer == address(0)) revert Errors.ZeroAddress();
        if (price == 0) revert Errors.ZeroAmount();
        if (deadline <= block.timestamp) revert Errors.DeadlinePassed();

        // Check robot has sufficient bond
        uint256 minBond = (price * MIN_BOND_RATIO) / 10000;
        if (bond.available(robotId) < minBond) revert Errors.InsufficientBond();

        jobId = ++jobCount;
        jobs[jobId] = Job({
            buyer: buyer,
            robotId: robotId,
            jobSpecHash: jobSpecHash,
            price: price,
            deadline: deadline,
            status: Status.FUNDED,
            completionHash: bytes32(0),
            tokenId: 0,
            settleAfter: 0,
            qualityScore: 0,
            workUnits: 0
        });

        // Store service type
        jobServiceTypes[jobId] = serviceTypeHash;

        // Lock bond
        bond.lock(robotId, minBond);

        // Transfer funds from the authorized caller (OfferBook)
        token.safeTransferFrom(msg.sender, address(this), price);

        // Emit both V1 and V2 events for backward compatibility
        emit JobCreated(jobId, buyer, robotId, jobSpecHash, price, deadline);
        emit JobFunded(jobId, price);
        emit JobCreatedV2(jobId, serviceTypeHash, buyer, robotId, price, deadline);
    }

    function createJob(
        bytes32 jobSpecHash,
        bytes32 robotId,
        uint256 price,
        uint256 deadline
    ) external returns (uint256 jobId) {
        if (price == 0) revert Errors.ZeroAmount();
        if (deadline <= block.timestamp) revert Errors.DeadlinePassed();

        // Check robot has sufficient bond
        uint256 minBond = (price * MIN_BOND_RATIO) / 10000;
        if (bond.available(robotId) < minBond) revert Errors.InsufficientBond();

        jobId = ++jobCount;
        jobs[jobId] = Job({
            buyer: msg.sender,
            robotId: robotId,
            jobSpecHash: jobSpecHash,
            price: price,
            deadline: deadline,
            status: Status.CREATED,
            completionHash: bytes32(0),
            tokenId: 0,
            settleAfter: 0,
            qualityScore: 0,
            workUnits: 0
        });

        // Lock bond
        bond.lock(robotId, minBond);

        emit JobCreated(jobId, msg.sender, robotId, jobSpecHash, price, deadline);
    }

    /**
     * @notice Create a V2 job with service type tracking
     * @param serviceTypeHash Hash of the service type (e.g., keccak256("inspection"))
     * @param jobSpecHash Hash of the job specification
     * @param robotId Robot identifier
     * @param price Job price
     * @param deadline Job deadline
     */
    function createJobV2(
        bytes32 serviceTypeHash,
        bytes32 jobSpecHash,
        bytes32 robotId,
        uint256 price,
        uint256 deadline
    ) external returns (uint256 jobId) {
        if (price == 0) revert Errors.ZeroAmount();
        if (deadline <= block.timestamp) revert Errors.DeadlinePassed();

        // Check robot has sufficient bond
        uint256 minBond = (price * MIN_BOND_RATIO) / 10000;
        if (bond.available(robotId) < minBond) revert Errors.InsufficientBond();

        jobId = ++jobCount;
        jobs[jobId] = Job({
            buyer: msg.sender,
            robotId: robotId,
            jobSpecHash: jobSpecHash,
            price: price,
            deadline: deadline,
            status: Status.CREATED,
            completionHash: bytes32(0),
            tokenId: 0,
            settleAfter: 0,
            qualityScore: 0,
            workUnits: 0
        });

        // Store service type
        jobServiceTypes[jobId] = serviceTypeHash;

        // Lock bond
        bond.lock(robotId, minBond);

        // Emit both V1 and V2 events for backward compatibility
        emit JobCreated(jobId, msg.sender, robotId, jobSpecHash, price, deadline);
        emit JobCreatedV2(jobId, serviceTypeHash, msg.sender, robotId, price, deadline);
    }

    function fund(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (job.buyer == address(0)) revert Errors.JobNotFound();
        if (job.status != Status.CREATED) revert Errors.InvalidStatus();
        if (msg.sender != job.buyer) revert Errors.NotAuthorized();

        token.safeTransferFrom(msg.sender, address(this), job.price);
        job.status = Status.FUNDED;

        emit JobFunded(jobId, job.price);
    }

    function submitCompletion(uint256 jobId, bytes32 completionHash, bytes calldata signature) external {
        Job storage job = jobs[jobId];
        if (job.buyer == address(0)) revert Errors.JobNotFound();
        if (job.status != Status.FUNDED) revert Errors.InvalidStatus();
        if (block.timestamp > job.deadline) revert Errors.DeadlinePassed();

        // Anti-replay check
        bytes32 claimId = keccak256(abi.encode(jobId, completionHash));
        if (claimUsed[claimId]) revert Errors.ClaimAlreadyUsed();
        claimUsed[claimId] = true;

        // Verify EIP-712 signature
        address controller = identity.getController(job.robotId);
        if (controller == address(0)) revert Errors.RobotNotFound();

        EIP712Types.CompletionClaim memory claim = EIP712Types.CompletionClaim({
            jobId: jobId,
            jobSpecHash: job.jobSpecHash,
            completionHash: completionHash,
            robotId: job.robotId,
            controller: controller,
            deadline: job.deadline
        });

        bytes32 structHash = EIP712Types.hashCompletionClaim(claim);
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        if (signer != controller) revert Errors.InvalidSignature();

        job.completionHash = completionHash;
        job.status = Status.COMPLETED;
        job.settleAfter = block.timestamp + CHALLENGE_WINDOW;

        emit CompletionSubmitted(jobId, completionHash);
    }

    /**
     * @notice Submit completion with DePIN metrics (V2)
     * @param jobId Job identifier
     * @param completionHash Hash of completion data
     * @param qualityScore Quality score (80-120, mapped to 0.8x-1.2x multiplier)
     * @param workUnits Work units completed (1-65535)
     * @param signature EIP-712 signature from controller
     */
    function submitCompletionV2(
        uint256 jobId,
        bytes32 completionHash,
        uint8 qualityScore,
        uint32 workUnits,
        bytes calldata signature
    ) external {
        Job storage job = jobs[jobId];
        if (job.buyer == address(0)) revert Errors.JobNotFound();
        if (job.status != Status.FUNDED) revert Errors.InvalidStatus();
        if (block.timestamp > job.deadline) revert Errors.DeadlinePassed();

        // Anti-replay check
        bytes32 claimId = keccak256(abi.encode(jobId, completionHash, qualityScore, workUnits));
        if (claimUsed[claimId]) revert Errors.ClaimAlreadyUsed();
        claimUsed[claimId] = true;

        // Verify EIP-712 signature
        address controller = identity.getController(job.robotId);
        if (controller == address(0)) revert Errors.RobotNotFound();

        EIP712Types.CompletionClaimV2 memory claim = EIP712Types.CompletionClaimV2({
            jobId: jobId,
            jobSpecHash: job.jobSpecHash,
            completionHash: completionHash,
            robotId: job.robotId,
            controller: controller,
            deadline: job.deadline,
            qualityScore: qualityScore,
            workUnits: workUnits
        });

        bytes32 structHash = EIP712Types.hashCompletionClaimV2(claim);
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        if (signer != controller) revert Errors.InvalidSignature();

        job.completionHash = completionHash;
        job.qualityScore = qualityScore;
        job.workUnits = workUnits;
        job.status = Status.COMPLETED;
        job.settleAfter = block.timestamp + CHALLENGE_WINDOW;

        emit CompletionSubmitted(jobId, completionHash);
    }

    function settle(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (job.buyer == address(0)) revert Errors.JobNotFound();
        if (job.status != Status.COMPLETED) revert Errors.InvalidStatus();
        if (block.timestamp < job.settleAfter) revert Errors.ChallengeWindowActive();

        // Calculate fee and payout
        uint256 fee = (job.price * TAU_BPS) / 10000;
        uint256 payout = job.price - fee;

        address controller = identity.getController(job.robotId);

        // Transfer funds
        token.safeTransfer(treasury, fee);
        token.safeTransfer(controller, payout);

        // Mint receipt
        uint256 tokenId = uint256(keccak256(abi.encode(job.jobSpecHash, job.completionHash)));
        bytes32 metadataHash = keccak256(abi.encode(jobId, job.jobSpecHash, job.completionHash));
        receipt.mint(job.buyer, tokenId, metadataHash);
        job.tokenId = tokenId;

        // Unlock bond
        uint256 lockedBond = (job.price * MIN_BOND_RATIO) / 10000;
        bond.unlock(job.robotId, lockedBond);

        // DePIN hooks (if enabled)
        if (address(reputationLedger) != address(0)) {
            reputationLedger.recordJobComplete(job.robotId);
        }

        if (address(rewardsDistributor) != address(0) && job.workUnits > 0) {
            rewardsDistributor.onJobFinal(
                jobId,
                IRewardsDistributor.RewardParams({
                    robotId: job.robotId,
                    controller: controller,
                    qualityScore: job.qualityScore,
                    workUnits: job.workUnits,
                    jobPrice: job.price
                })
            );
        }

        job.status = Status.SETTLED;

        emit JobSettled(jobId, tokenId, payout, fee);

        // Emit V2 event if service type is set (for V2 jobs)
        bytes32 serviceTypeHash = jobServiceTypes[jobId];
        if (serviceTypeHash != bytes32(0)) {
            emit JobSettledV2(jobId, serviceTypeHash, tokenId, 1); // 1 = SUCCESS
        }
    }

    // Called by DisputeManager
    function refund(uint256 jobId) external onlyDisputeManager {
        Job storage job = jobs[jobId];
        if (job.status != Status.DISPUTED) revert Errors.InvalidStatus();

        token.safeTransfer(job.buyer, job.price);
        job.status = Status.REFUNDED;

        emit Events.JobRefunded(jobId, job.buyer, job.price);
    }

    function setDisputed(uint256 jobId) external onlyDisputeManager {
        Job storage job = jobs[jobId];
        if (job.status != Status.COMPLETED) revert Errors.InvalidStatus();
        job.status = Status.DISPUTED;
    }

    // View functions
    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    function hashTypedDataV4(bytes32 structHash) external view returns (bytes32) {
        return _hashTypedDataV4(structHash);
    }
}
