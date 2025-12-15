// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReceipt1155 {
    function mint(address to, uint256 tokenId, bytes32 metadataHash) external;
    function burn(uint256 tokenId) external;
    function getMetadata(uint256 tokenId) external view returns (bytes32);
    function exists(uint256 tokenId) external view returns (bool);
}
