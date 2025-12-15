// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IStakingGate.sol";
import "../libraries/Errors.sol";

/**
 * @title StakingGate
 * @notice VRWX staking for market access with timelock and slashing
 * @dev Requirements:
 *   - Operators stake minStakeVRWX to participate in offers market
 *   - Unstaking has UNLOCK_DELAY (7 days) timelock
 *   - FRAUD/NON_DELIVERY triggers slashPercentBps (default 25%)
 */
contract StakingGate is IStakingGate {
    using SafeERC20 for IERC20;

    IERC20 public immutable vrwxToken;

    address public disputeManager;
    address public admin;

    uint256 public minStakeVRWX = 1000 ether; // 1000 VRWX minimum
    uint256 public constant UNLOCK_DELAY = 7 days;
    uint16 public slashPercentBps = 2500; // 25% slash on fraud

    mapping(address => StakeData) private _stakes;

    modifier onlyDisputeManager() {
        if (msg.sender != disputeManager) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Errors.NotAuthorized();
        _;
    }

    constructor(address _vrwxToken) {
        if (_vrwxToken == address(0)) revert Errors.ZeroAddress();
        vrwxToken = IERC20(_vrwxToken);
        admin = msg.sender;
    }

    function setDisputeManager(address _disputeManager) external onlyAdmin {
        if (_disputeManager == address(0)) revert Errors.ZeroAddress();
        disputeManager = _disputeManager;
    }

    function setMinStakeVRWX(uint256 _minStake) external onlyAdmin {
        minStakeVRWX = _minStake;
    }

    function setSlashPercentBps(uint16 _slashBps) external onlyAdmin {
        if (_slashBps > 10000) revert Errors.InvalidAmount();
        slashPercentBps = _slashBps;
    }

    /**
     * @notice Stake VRWX tokens
     * @param amount Amount to stake
     */
    function stake(uint256 amount) external {
        if (amount == 0) revert Errors.ZeroAmount();

        vrwxToken.safeTransferFrom(msg.sender, address(this), amount);
        _stakes[msg.sender].staked += amount;

        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Request to unlock staked tokens (starts timelock)
     * @param amount Amount to unlock
     */
    function requestUnlock(uint256 amount) external {
        StakeData storage s = _stakes[msg.sender];
        if (s.staked < amount) revert Errors.InsufficientBalance();
        if (s.unlockRequestedAt != 0) revert Errors.UnlockAlreadyPending();

        s.unlockRequestedAt = block.timestamp;
        s.unlockAmount = amount;

        emit UnlockRequested(msg.sender, amount, block.timestamp + UNLOCK_DELAY);
    }

    /**
     * @notice Cancel pending unlock request
     */
    function cancelUnlock() external {
        StakeData storage s = _stakes[msg.sender];
        if (s.unlockRequestedAt == 0) revert Errors.NoUnlockPending();

        s.unlockRequestedAt = 0;
        s.unlockAmount = 0;
    }

    /**
     * @notice Withdraw staked tokens after timelock expires
     */
    function unstake() external {
        StakeData storage s = _stakes[msg.sender];
        if (s.unlockRequestedAt == 0) revert Errors.NoUnlockPending();
        if (block.timestamp < s.unlockRequestedAt + UNLOCK_DELAY) revert Errors.TimelockActive();

        uint256 amount = s.unlockAmount;
        s.staked -= amount;
        s.unlockRequestedAt = 0;
        s.unlockAmount = 0;

        vrwxToken.safeTransfer(msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }

    /**
     * @notice Slash operator's stake on fraud/non-delivery
     * @param operator Operator to slash
     * @param recipient Recipient of slashed tokens (challenger)
     */
    function slashStakeVRWX(address operator, address recipient) external onlyDisputeManager {
        if (recipient == address(0)) revert Errors.ZeroAddress();

        StakeData storage s = _stakes[operator];
        uint256 slashAmount = (s.staked * slashPercentBps) / 10000;

        if (slashAmount > 0) {
            s.staked -= slashAmount;

            // Cancel any pending unlock if slashing puts them below it
            if (s.staked < s.unlockAmount) {
                s.unlockRequestedAt = 0;
                s.unlockAmount = 0;
            }

            vrwxToken.safeTransfer(recipient, slashAmount);

            emit StakeSlashed(operator, slashAmount, recipient);
        }
    }

    /**
     * @notice Check if operator has minimum stake
     * @param operator Operator address
     */
    function hasMinStake(address operator) external view returns (bool) {
        return _stakes[operator].staked >= minStakeVRWX;
    }

    /**
     * @notice Get stake data for operator
     * @param operator Operator address
     */
    function getStake(address operator) external view returns (StakeData memory) {
        return _stakes[operator];
    }
}
