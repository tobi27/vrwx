// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/mocks/MockERC20.sol";
import "../src/core/IdentityRegistry.sol";
import "../src/core/BondManager.sol";
import "../src/core/Receipt1155.sol";
import "../src/core/JobEscrow.sol";
import "../src/core/DisputeManager.sol";
import "../src/depin/VRWXToken.sol";
import "../src/depin/RewardsDistributor.sol";
import "../src/depin/ReputationLedger.sol";
import "../src/depin/FeeRouter.sol";
import "../src/depin/StakingGate.sol";
import "../src/market/OfferBook.sol";

/**
 * @title DeployFull
 * @notice Full deployment script for VRWX P1.5 (Core + DePIN + Market)
 * @dev Usage:
 *   Local:   forge script script/DeployFull.s.sol --broadcast --rpc-url http://localhost:8545
 *   Testnet: forge script script/DeployFull.s.sol --broadcast --rpc-url $RPC_URL --verify
 *
 * Environment variables:
 *   PRIVATE_KEY - Deployer private key
 *   TREASURY    - Treasury address for fees
 *   STABLE_TOKEN - Existing stablecoin address (optional, deploys mock if not set)
 */
contract DeployFull is Script {
    // Deployed addresses
    address public stableToken;
    address public vrwxToken;
    address public identity;
    address public bond;
    address public receipt;
    address public escrow;
    address public dispute;
    address public rewardsDistributor;
    address public reputationLedger;
    address public feeRouter;
    address public stakingGate;
    address public offerBook;

    function run() external {
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address treasury = vm.envOr("TREASURY", vm.addr(deployerKey));
        address existingStable = vm.envOr("STABLE_TOKEN", address(0));

        vm.startBroadcast(deployerKey);

        console.log("=== VRWX Full Deployment ===");
        console.log("Deployer:", vm.addr(deployerKey));
        console.log("Treasury:", treasury);

        // =========================================
        // PHASE 1: Core Infrastructure
        // =========================================
        console.log("\n--- Phase 1: Core Infrastructure ---");

        // 1.1 Stablecoin (use existing or deploy mock)
        if (existingStable != address(0)) {
            stableToken = existingStable;
            console.log("Using existing stablecoin:", stableToken);
        } else {
            MockERC20 mock = new MockERC20();
            stableToken = address(mock);
            console.log("Deployed MockERC20 (stable):", stableToken);
        }

        // 1.2 VRWX Token
        VRWXToken vrwx = new VRWXToken();
        vrwxToken = address(vrwx);
        console.log("VRWXToken:", vrwxToken);

        // 1.3 Identity Registry
        IdentityRegistry id = new IdentityRegistry();
        identity = address(id);
        console.log("IdentityRegistry:", identity);

        // 1.4 Bond Manager
        BondManager bm = new BondManager(stableToken, identity);
        bond = address(bm);
        console.log("BondManager:", bond);

        // 1.5 Receipt NFT
        Receipt1155 rc = new Receipt1155();
        receipt = address(rc);
        console.log("Receipt1155:", receipt);

        // =========================================
        // PHASE 2: DePIN Layer
        // =========================================
        console.log("\n--- Phase 2: DePIN Layer ---");

        // 2.1 Reputation Ledger
        ReputationLedger rep = new ReputationLedger();
        reputationLedger = address(rep);
        console.log("ReputationLedger:", reputationLedger);

        // 2.2 Fee Router
        FeeRouter fr = new FeeRouter(vrwxToken, stableToken, treasury);
        feeRouter = address(fr);
        console.log("FeeRouter:", feeRouter);

        // 2.3 Staking Gate
        StakingGate sg = new StakingGate(vrwxToken);
        stakingGate = address(sg);
        console.log("StakingGate:", stakingGate);

        // 2.4 Job Escrow (with DePIN support)
        JobEscrow je = new JobEscrow(stableToken, treasury);
        escrow = address(je);
        console.log("JobEscrow:", escrow);

        // 2.5 Rewards Distributor (constructor only takes vrwxToken)
        RewardsDistributor rd = new RewardsDistributor(vrwxToken);
        rewardsDistributor = address(rd);
        console.log("RewardsDistributor:", rewardsDistributor);

        // 2.6 Dispute Manager
        DisputeManager dm = new DisputeManager(escrow, bond, receipt);
        dispute = address(dm);
        console.log("DisputeManager:", dispute);

        // =========================================
        // PHASE 3: Market Layer
        // =========================================
        console.log("\n--- Phase 3: Market Layer ---");

        // 3.1 Offer Book (constructor takes escrow, stableToken)
        OfferBook ob = new OfferBook(escrow, stableToken);
        offerBook = address(ob);
        console.log("OfferBook:", offerBook);

        // =========================================
        // PHASE 4: Configuration
        // =========================================
        console.log("\n--- Phase 4: Configuration ---");

        // Core contract wiring
        je.setContracts(identity, bond, receipt, dispute);
        bm.setJobEscrow(escrow);
        bm.setDisputeManager(dispute);
        rc.setJobEscrow(escrow);
        rc.setDisputeManager(dispute);
        console.log("Core contracts wired");

        // DePIN contract wiring
        je.setDepinContracts(rewardsDistributor, feeRouter, reputationLedger);
        je.setAuthorizedCaller(offerBook, true);
        dm.setDepinContracts(stakingGate, reputationLedger);
        sg.setDisputeManager(dispute);

        // ReputationLedger wiring
        rep.setJobEscrow(escrow);
        rep.setDisputeManager(dispute);

        // RewardsDistributor wiring
        rd.setJobEscrow(escrow);
        rd.setReputationLedger(reputationLedger);

        // OfferBook wiring
        ob.setStakingGate(stakingGate);
        ob.setFeeRouter(feeRouter);

        // FeeRouter wiring
        fr.setAuthorizedCaller(offerBook, true);

        console.log("DePIN contracts wired");

        // Grant VRWX roles
        vrwx.grantRole(vrwx.MINTER_ROLE(), rewardsDistributor);
        vrwx.grantRole(vrwx.BURNER_ROLE(), feeRouter);
        console.log("VRWX roles granted");

        vm.stopBroadcast();

        // =========================================
        // Output deployment info
        // =========================================
        console.log("\n=== Deployment Complete ===");
        console.log("\nExport these addresses:");
        console.log("STABLE_TOKEN=%s", stableToken);
        console.log("VRWX_TOKEN=%s", vrwxToken);
        console.log("IDENTITY=%s", identity);
        console.log("BOND=%s", bond);
        console.log("RECEIPT=%s", receipt);
        console.log("ESCROW=%s", escrow);
        console.log("DISPUTE=%s", dispute);
        console.log("REWARDS=%s", rewardsDistributor);
        console.log("REPUTATION=%s", reputationLedger);
        console.log("FEE_ROUTER=%s", feeRouter);
        console.log("STAKING=%s", stakingGate);
        console.log("OFFER_BOOK=%s", offerBook);
    }
}
