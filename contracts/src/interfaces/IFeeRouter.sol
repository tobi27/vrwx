// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFeeRouter {
    event VRWXBurned(address indexed from, uint256 amount, string reason);
    event FeeRouted(address indexed to, uint256 amount);

    function burnListingFee(address from) external;
    function burnSettleFee(address from, uint256 amount) external;

    function setListingFeeVRWX(uint256 amount) external;
    function setSettleFeeVRWX(uint256 amount) external;
    function setAuthorizedCaller(address caller, bool authorized) external;

    function listingFeeVRWX() external view returns (uint256);
    function settleFeeVRWX() external view returns (uint256);
}
