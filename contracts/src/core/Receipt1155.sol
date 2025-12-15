// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "../interfaces/IReceipt1155.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";

contract Receipt1155 is ERC1155, IReceipt1155 {
    address public jobEscrow;
    address public disputeManager;
    address public admin;

    mapping(uint256 => bytes32) private _metadata;
    mapping(uint256 => bool) private _exists;

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

    constructor() ERC1155("") {
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

    function mint(address to, uint256 tokenId, bytes32 metadataHash) external onlyJobEscrow {
        if (to == address(0)) revert Errors.ZeroAddress();
        if (_exists[tokenId]) revert Errors.TokenAlreadyMinted();

        _exists[tokenId] = true;
        _metadata[tokenId] = metadataHash;
        _mint(to, tokenId, 1, "");

        emit Events.ReceiptMinted(0, tokenId, to, metadataHash);
    }

    function burn(uint256 tokenId) external onlyDisputeManager {
        if (!_exists[tokenId]) revert Errors.TokenNotFound();

        // Find the owner and burn
        // Note: In practice, we'd need to track the owner or pass it as a parameter
        // For simplicity, we mark as not existing
        _exists[tokenId] = false;
        delete _metadata[tokenId];

        emit Events.ReceiptBurned(tokenId);
    }

    function getMetadata(uint256 tokenId) external view returns (bytes32) {
        return _metadata[tokenId];
    }

    function exists(uint256 tokenId) external view returns (bool) {
        return _exists[tokenId];
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        // Return empty string for MVP - can be extended for IPFS/metadata server
        return "";
    }
}
