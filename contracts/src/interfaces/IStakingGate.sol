// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStakingGate {
    struct StakeData {
        uint256 staked;
        uint256 unlockRequestedAt;
        uint256 unlockAmount;
    }

    event Staked(address indexed operator, uint256 amount);
    event UnlockRequested(address indexed operator, uint256 amount, uint256 unlockAt);
    event Unstaked(address indexed operator, uint256 amount);
    event StakeSlashed(address indexed operator, uint256 slashedAmount, address recipient);

    function stake(uint256 amount) external;
    function requestUnlock(uint256 amount) external;
    function unstake() external;
    function slashStakeVRWX(address operator, address recipient) external;

    function hasMinStake(address operator) external view returns (bool);
    function getStake(address operator) external view returns (StakeData memory);
    function minStakeVRWX() external view returns (uint256);
}
