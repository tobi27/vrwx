// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBondManager {
    function deposit(bytes32 robotId, uint256 amount) external;
    function withdraw(bytes32 robotId, uint256 amount) external;
    function lock(bytes32 robotId, uint256 amount) external;
    function unlock(bytes32 robotId, uint256 amount) external;
    function slash(bytes32 robotId, uint256 amount, address recipient) external;

    function bonded(bytes32 robotId) external view returns (uint256);
    function locked(bytes32 robotId) external view returns (uint256);
    function available(bytes32 robotId) external view returns (uint256);
}
