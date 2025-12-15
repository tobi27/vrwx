// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IOfferBook.sol";
import "../interfaces/IStakingGate.sol";
import "../interfaces/IFeeRouter.sol";
import "../libraries/Errors.sol";

/**
 * @title OfferBook
 * @notice Marketplace for robotic work offers
 * @dev Requirements:
 *   - Operators must have minimum stake to create offers
 *   - Listing fee (VRWX) is burned on offer creation
 *   - Buyers pay in stablecoins
 *   - Purchasing an offer creates a job atomically
 */
interface IJobEscrowForOffers {
    function createAndFundJobFor(address buyer, bytes32 jobSpecHash, bytes32 robotId, uint256 price, uint256 deadline) external returns (uint256);
    function createAndFundJobV2For(address buyer, bytes32 serviceTypeHash, bytes32 jobSpecHash, bytes32 robotId, uint256 price, uint256 deadline) external returns (uint256);
    function token() external view returns (IERC20);
}

contract OfferBook is IOfferBook {
    using SafeERC20 for IERC20;

    IJobEscrowForOffers public immutable jobEscrow;
    IERC20 public immutable stableToken;
    IStakingGate public stakingGate;
    IFeeRouter public feeRouter;

    address public admin;

    uint256 public override offerCount;
    mapping(uint256 => Offer) private _offers;

    // V2: Service type tracking for multi-service offers
    mapping(uint256 => bytes32) public override offerServiceTypes;

    // Default job deadline extension when buying an offer
    uint256 public defaultDeadlineExtension = 7 days;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyStaked() {
        if (address(stakingGate) != address(0) && !stakingGate.hasMinStake(msg.sender)) {
            revert Errors.InsufficientStake();
        }
        _;
    }

    constructor(address _jobEscrow, address _stableToken) {
        if (_jobEscrow == address(0) || _stableToken == address(0)) {
            revert Errors.ZeroAddress();
        }
        jobEscrow = IJobEscrowForOffers(_jobEscrow);
        stableToken = IERC20(_stableToken);
        admin = msg.sender;
    }

    /**
     * @notice Set staking gate contract (set to 0 to disable stake requirement)
     */
    function setStakingGate(address _stakingGate) external onlyAdmin {
        stakingGate = IStakingGate(_stakingGate);
    }

    /**
     * @notice Set fee router contract (set to 0 to disable listing fees)
     */
    function setFeeRouter(address _feeRouter) external onlyAdmin {
        feeRouter = IFeeRouter(_feeRouter);
    }

    /**
     * @notice Set default deadline extension for purchased offers
     */
    function setDefaultDeadlineExtension(uint256 extension) external onlyAdmin {
        defaultDeadlineExtension = extension;
    }

    /**
     * @notice Create a new offer (requires stake if stakingGate is set)
     * @param robotId Robot identifier
     * @param jobSpecHash Hash of job specification
     * @param price Price in stablecoins
     * @param duration How long the offer is valid
     * @return offerId The created offer ID
     */
    function createOffer(
        bytes32 robotId,
        bytes32 jobSpecHash,
        uint256 price,
        uint256 duration
    ) external override onlyStaked returns (uint256 offerId) {
        if (price == 0) revert Errors.ZeroAmount();
        if (duration == 0) revert Errors.InvalidAmount();

        // Burn listing fee if feeRouter is set
        if (address(feeRouter) != address(0)) {
            feeRouter.burnListingFee(msg.sender);
        }

        offerId = ++offerCount;
        _offers[offerId] = Offer({
            operator: msg.sender,
            robotId: robotId,
            jobSpecHash: jobSpecHash,
            price: price,
            expiresAt: block.timestamp + duration,
            active: true
        });

        emit OfferCreated(offerId, msg.sender, robotId, price);
    }

    /**
     * @notice Cancel an active offer
     * @param offerId The offer to cancel
     */
    function cancelOffer(uint256 offerId) external override {
        Offer storage offer = _offers[offerId];
        if (offer.operator == address(0)) revert Errors.OfferNotFound();
        if (offer.operator != msg.sender) revert Errors.NotAuthorized();
        if (!offer.active) revert Errors.OfferNotActive();

        offer.active = false;

        emit OfferCancelled(offerId);
    }

    /**
     * @notice Purchase an offer and create a job
     * @param offerId The offer to purchase
     * @return jobId The created job ID
     */
    function buyOffer(uint256 offerId) external override returns (uint256 jobId) {
        Offer storage offer = _offers[offerId];
        if (offer.operator == address(0)) revert Errors.OfferNotFound();
        if (!offer.active) revert Errors.OfferNotActive();
        if (block.timestamp >= offer.expiresAt) revert Errors.OfferExpired();

        // Mark offer as inactive
        offer.active = false;

        // Calculate job deadline
        uint256 deadline = block.timestamp + defaultDeadlineExtension;

        // Transfer stablecoins from buyer to this contract
        stableToken.safeTransferFrom(msg.sender, address(this), offer.price);

        // Approve JobEscrow to spend the tokens
        stableToken.approve(address(jobEscrow), offer.price);

        // Create and fund job on behalf of buyer
        jobId = jobEscrow.createAndFundJobFor(
            msg.sender, // actual buyer
            offer.jobSpecHash,
            offer.robotId,
            offer.price,
            deadline
        );

        emit OfferPurchased(offerId, msg.sender, jobId);
    }

    /**
     * @notice Get offer details
     * @param offerId The offer ID
     */
    function getOffer(uint256 offerId) external view override returns (Offer memory) {
        return _offers[offerId];
    }

    /**
     * @notice Check if an offer is purchasable
     * @param offerId The offer ID
     */
    function isPurchasable(uint256 offerId) external view returns (bool) {
        Offer storage offer = _offers[offerId];
        return offer.active && block.timestamp < offer.expiresAt;
    }

    /**
     * @notice Get all active offers (paginated)
     * @param start Starting index
     * @param limit Maximum number of offers to return
     */
    function getActiveOffers(uint256 start, uint256 limit) external view returns (Offer[] memory, uint256[] memory) {
        uint256 count = 0;
        uint256[] memory tempIds = new uint256[](limit);

        for (uint256 i = start; i <= offerCount && count < limit; i++) {
            if (_offers[i].active && block.timestamp < _offers[i].expiresAt) {
                tempIds[count] = i;
                count++;
            }
        }

        Offer[] memory offers = new Offer[](count);
        uint256[] memory ids = new uint256[](count);

        for (uint256 i = 0; i < count; i++) {
            ids[i] = tempIds[i];
            offers[i] = _offers[tempIds[i]];
        }

        return (offers, ids);
    }

    // ============================================================
    // V2 Multi-Service Functions
    // ============================================================

    /**
     * @notice Create a new offer with service type (V2)
     * @param serviceTypeHash Hash of the service type (keccak256 of "inspection", etc.)
     * @param robotId Robot identifier
     * @param jobSpecHash Hash of job specification
     * @param price Price in stablecoins
     * @param deadline Absolute timestamp when offer expires
     * @param minBond Minimum bond required (unused for now, for future use)
     * @return offerId The created offer ID
     */
    function createOfferV2(
        bytes32 serviceTypeHash,
        bytes32 robotId,
        bytes32 jobSpecHash,
        uint256 price,
        uint64 deadline,
        uint256 minBond
    ) external override onlyStaked returns (uint256 offerId) {
        if (price == 0) revert Errors.ZeroAmount();
        if (deadline <= block.timestamp) revert Errors.DeadlinePassed();
        if (serviceTypeHash == bytes32(0)) revert Errors.InvalidAmount();

        // Burn listing fee if feeRouter is set
        if (address(feeRouter) != address(0)) {
            feeRouter.burnListingFee(msg.sender);
        }

        offerId = ++offerCount;
        _offers[offerId] = Offer({
            operator: msg.sender,
            robotId: robotId,
            jobSpecHash: jobSpecHash,
            price: price,
            expiresAt: deadline,
            active: true
        });

        // Store service type
        offerServiceTypes[offerId] = serviceTypeHash;

        // Emit both V1 event for backward compatibility and V2 event
        emit OfferCreated(offerId, msg.sender, robotId, price);
        emit OfferCreatedV2(offerId, serviceTypeHash, msg.sender, robotId, jobSpecHash, price, deadline);

        // minBond stored for future use but not enforced yet
        // Can be used to require higher bonds for certain offer types
    }

    /**
     * @notice Purchase an offer and create a V2 job with service type
     * @param offerId The offer to purchase
     * @return jobId The created job ID
     */
    function buyOfferV2(uint256 offerId) external override returns (uint256 jobId) {
        Offer storage offer = _offers[offerId];
        if (offer.operator == address(0)) revert Errors.OfferNotFound();
        if (!offer.active) revert Errors.OfferNotActive();
        if (block.timestamp >= offer.expiresAt) revert Errors.OfferExpired();

        // Get service type
        bytes32 serviceTypeHash = offerServiceTypes[offerId];

        // Mark offer as inactive
        offer.active = false;

        // Calculate job deadline
        uint256 deadline = block.timestamp + defaultDeadlineExtension;

        // Transfer stablecoins from buyer to this contract
        stableToken.safeTransferFrom(msg.sender, address(this), offer.price);

        // Approve JobEscrow to spend the tokens
        stableToken.approve(address(jobEscrow), offer.price);

        // Create and fund V2 job on behalf of buyer
        if (serviceTypeHash != bytes32(0)) {
            jobId = jobEscrow.createAndFundJobV2For(
                msg.sender, // actual buyer
                serviceTypeHash,
                offer.jobSpecHash,
                offer.robotId,
                offer.price,
                deadline
            );
        } else {
            // Fallback to V1 for offers without service type
            jobId = jobEscrow.createAndFundJobFor(
                msg.sender,
                offer.jobSpecHash,
                offer.robotId,
                offer.price,
                deadline
            );
        }

        // Emit both V1 and V2 events
        emit OfferPurchased(offerId, msg.sender, jobId);
        if (serviceTypeHash != bytes32(0)) {
            emit OfferFilledV2(offerId, jobId, serviceTypeHash);
        }
    }

    /**
     * @notice Get all active offers filtered by service type (paginated)
     * @param serviceTypeHash The service type to filter by (0 for all)
     * @param start Starting index
     * @param limit Maximum number of offers to return
     */
    function getActiveOffersByService(
        bytes32 serviceTypeHash,
        uint256 start,
        uint256 limit
    ) external view returns (Offer[] memory, uint256[] memory) {
        uint256 count = 0;
        uint256[] memory tempIds = new uint256[](limit);

        for (uint256 i = start; i <= offerCount && count < limit; i++) {
            if (_offers[i].active && block.timestamp < _offers[i].expiresAt) {
                // If serviceTypeHash is 0, return all; otherwise filter
                if (serviceTypeHash == bytes32(0) || offerServiceTypes[i] == serviceTypeHash) {
                    tempIds[count] = i;
                    count++;
                }
            }
        }

        Offer[] memory offers = new Offer[](count);
        uint256[] memory ids = new uint256[](count);

        for (uint256 i = 0; i < count; i++) {
            ids[i] = tempIds[i];
            offers[i] = _offers[tempIds[i]];
        }

        return (offers, ids);
    }
}
