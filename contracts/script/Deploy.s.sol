// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/mocks/MockERC20.sol";
import "../src/core/IdentityRegistry.sol";
import "../src/core/BondManager.sol";
import "../src/core/Receipt1155.sol";
import "../src/core/JobEscrow.sol";
import "../src/core/DisputeManager.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address treasury = vm.envOr("TREASURY", address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8));

        vm.startBroadcast(deployerKey);

        // 1. Deploy MockERC20
        MockERC20 token = new MockERC20();
        console.log("Token:", address(token));

        // 2. Deploy IdentityRegistry
        IdentityRegistry identity = new IdentityRegistry();
        console.log("Identity:", address(identity));

        // 3. Deploy BondManager
        BondManager bond = new BondManager(address(token), address(identity));
        console.log("Bond:", address(bond));

        // 4. Deploy Receipt1155
        Receipt1155 receipt = new Receipt1155();
        console.log("Receipt:", address(receipt));

        // 5. Deploy JobEscrow
        JobEscrow escrow = new JobEscrow(address(token), treasury);
        console.log("Escrow:", address(escrow));

        // 6. Deploy DisputeManager
        DisputeManager dispute = new DisputeManager(address(escrow), address(bond), address(receipt));
        console.log("Dispute:", address(dispute));

        // 7. Configure contracts
        escrow.setContracts(address(identity), address(bond), address(receipt), address(dispute));
        bond.setJobEscrow(address(escrow));
        bond.setDisputeManager(address(dispute));
        receipt.setJobEscrow(address(escrow));
        receipt.setDisputeManager(address(dispute));

        vm.stopBroadcast();

        console.log("Deployment complete!");
    }
}
