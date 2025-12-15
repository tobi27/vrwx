// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IBondManager.sol";
import "../interfaces/IIdentityRegistry.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";

contract BondManager is IBondManager {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IIdentityRegistry public immutable identity;

    address public jobEscrow;
    address public disputeManager;
    address public admin;

    mapping(bytes32 => uint256) private _bonded;
    mapping(bytes32 => uint256) private _locked;

    modifier onlyJobEscrow() {
        if (msg.sender != jobEscrow) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyDisputeManager() {
        if (msg.sender != disputeManager) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Errors.NotAuthorized();
        _;
    }

    constructor(address _token, address _identity) {
        if (_token == address(0) || _identity == address(0)) revert Errors.ZeroAddress();
        token = IERC20(_token);
        identity = IIdentityRegistry(_identity);
        admin = msg.sender;
    }

    function setJobEscrow(address _jobEscrow) external onlyAdmin {
        if (_jobEscrow == address(0)) revert Errors.ZeroAddress();
        jobEscrow = _jobEscrow;
    }

    function setDisputeManager(address _disputeManager) external onlyAdmin {
        if (_disputeManager == address(0)) revert Errors.ZeroAddress();
        disputeManager = _disputeManager;
    }

    function deposit(bytes32 robotId, uint256 amount) external {
        if (amount == 0) revert Errors.ZeroAmount();
        address controller = identity.getController(robotId);
        if (controller == address(0)) revert Errors.RobotNotFound();

        token.safeTransferFrom(msg.sender, address(this), amount);
        _bonded[robotId] += amount;

        emit Events.BondDeposited(robotId, amount, _bonded[robotId]);
    }

    function withdraw(bytes32 robotId, uint256 amount) external {
        if (amount == 0) revert Errors.ZeroAmount();
        address controller = identity.getController(robotId);
        if (controller != msg.sender) revert Errors.NotAuthorized();

        uint256 availableAmount = _bonded[robotId] - _locked[robotId];
        if (amount > availableAmount) revert Errors.InsufficientBalance();

        _bonded[robotId] -= amount;
        token.safeTransfer(msg.sender, amount);

        emit Events.BondWithdrawn(robotId, amount, _bonded[robotId]);
    }

    function lock(bytes32 robotId, uint256 amount) external onlyJobEscrow {
        if (amount > _bonded[robotId] - _locked[robotId]) revert Errors.InsufficientBond();
        _locked[robotId] += amount;
        emit Events.BondLocked(robotId, amount, _locked[robotId]);
    }

    function unlock(bytes32 robotId, uint256 amount) external onlyJobEscrow {
        if (amount > _locked[robotId]) revert Errors.InsufficientBalance();
        _locked[robotId] -= amount;
        emit Events.BondUnlocked(robotId, amount, _locked[robotId]);
    }

    function slash(bytes32 robotId, uint256 amount, address recipient) external onlyDisputeManager {
        if (recipient == address(0)) revert Errors.ZeroAddress();
        if (amount > _locked[robotId]) {
            amount = _locked[robotId];
        }

        _locked[robotId] -= amount;
        _bonded[robotId] -= amount;
        token.safeTransfer(recipient, amount);

        emit Events.BondSlashed(robotId, amount, recipient);
    }

    function bonded(bytes32 robotId) external view returns (uint256) {
        return _bonded[robotId];
    }

    function locked(bytes32 robotId) external view returns (uint256) {
        return _locked[robotId];
    }

    function available(bytes32 robotId) external view returns (uint256) {
        return _bonded[robotId] - _locked[robotId];
    }
}
