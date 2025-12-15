// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IFeeRouter.sol";
import "../interfaces/IVRWXToken.sol";
import "../libraries/Errors.sol";

/**
 * @title FeeRouter
 * @notice Routes and optionally burns VRWX fees
 * @dev Fee Types:
 *   - listingFeeVRWX: Burned when creating offers
 *   - settleFeeVRWX: Optional VRWX portion of settlement fee
 *   Stablecoin fees still go to treasury (unchanged P0/P1 behavior)
 */
contract FeeRouter is IFeeRouter {
    using SafeERC20 for IERC20;

    IVRWXToken public immutable vrwxToken;
    IERC20 public immutable stableToken;

    address public treasury;
    address public admin;

    uint256 public listingFeeVRWX = 10 ether; // 10 VRWX to list offer
    uint256 public settleFeeVRWX = 0; // Optional VRWX burn on settle

    mapping(address => bool) public authorizedCallers;

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender]) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Errors.NotAuthorized();
        _;
    }

    constructor(address _vrwxToken, address _stableToken, address _treasury) {
        if (_vrwxToken == address(0) || _stableToken == address(0) || _treasury == address(0)) {
            revert Errors.ZeroAddress();
        }
        vrwxToken = IVRWXToken(_vrwxToken);
        stableToken = IERC20(_stableToken);
        treasury = _treasury;
        admin = msg.sender;
    }

    function setListingFeeVRWX(uint256 amount) external onlyAdmin {
        listingFeeVRWX = amount;
    }

    function setSettleFeeVRWX(uint256 amount) external onlyAdmin {
        settleFeeVRWX = amount;
    }

    function setTreasury(address _treasury) external onlyAdmin {
        if (_treasury == address(0)) revert Errors.ZeroAddress();
        treasury = _treasury;
    }

    function setAuthorizedCaller(address caller, bool authorized) external onlyAdmin {
        authorizedCallers[caller] = authorized;
    }

    /**
     * @notice Burn listing fee from operator
     * @param from Operator address
     */
    function burnListingFee(address from) external onlyAuthorized {
        if (listingFeeVRWX > 0) {
            vrwxToken.burn(from, listingFeeVRWX);
            emit VRWXBurned(from, listingFeeVRWX, "listing");
        }
    }

    /**
     * @notice Burn settlement fee from operator
     * @param from Operator address
     * @param amount Amount to burn (0 = use default settleFeeVRWX)
     */
    function burnSettleFee(address from, uint256 amount) external onlyAuthorized {
        uint256 burnAmount = amount > 0 ? amount : settleFeeVRWX;
        if (burnAmount > 0) {
            vrwxToken.burn(from, burnAmount);
            emit VRWXBurned(from, burnAmount, "settle");
        }
    }

    /**
     * @notice Route stablecoin fee to treasury
     * @param from Address to transfer from
     * @param amount Amount to route
     */
    function routeStableFee(address from, uint256 amount) external onlyAuthorized {
        if (amount > 0) {
            stableToken.safeTransferFrom(from, treasury, amount);
            emit FeeRouted(treasury, amount);
        }
    }
}
