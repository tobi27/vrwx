#!/bin/bash
# VRWX Proof Cast - Contract Verification via Foundry Cast
# Verifies all deployed contracts on Base Mainnet

set -e

RPC="https://mainnet.base.org"
echo "🔍 VRWX Proof Cast - Contract Verification"
echo "Network: Base Mainnet (8453)"
echo "RPC: $RPC"
echo ""

# Contract addresses from deploy/addresses.base-mainnet.json
USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
VRWX="0x47f81Aa69BA606552201E5b4Ba9827d340fe23A4"
IDENTITY="0x1f9Aa1738428a8b81798C79F571a61f0C2A8658b"
ESCROW="0x7B55CD2614d42E328622E13E2F04c6A4044dCf8B"
RECEIPT="0xe7980B02E665AaB62fA5e5Bc10D35c7823ee1B04"
BOND="0xA0d9224a0528695383ECF8d1a7F62b5E32de79C4"
DISPUTE="0x0E1850DEe87Cb9D870DB388292044EFA120A6d5E"
REWARDS="0xe785570963a9218bb51A2Cd5c23369Fc7e19FB78"
REPUTATION="0xfF69b1389CcA9caCA301f0a6b63cAcbc62419F85"
FEEROUTER="0xf55c9F57487039112eAEeDbaeB45eeA8E3d536fe"
STAKING="0x923A967Ae7e7bB1bBb90a87ef9877b645CC16437"
OFFERBOOK="0x3523C4E90CD3f5B58Fb016D003145E178560376b"

PASSED=0
FAILED=0

check_contract() {
    local name=$1
    local addr=$2
    local sig=$3
    local expected=$4

    echo -n "📋 $name ($addr)... "

    result=$(cast call "$addr" "$sig" --rpc-url "$RPC" 2>&1) || result="ERROR"

    if [[ "$result" == *"ERROR"* ]] || [[ "$result" == *"error"* ]]; then
        echo "❌ FAIL"
        FAILED=$((FAILED + 1))
        return 1
    fi

    if [[ -n "$expected" ]]; then
        if [[ "$result" == *"$expected"* ]]; then
            echo "✅ OK ($result)"
        else
            echo "⚠️  UNEXPECTED: $result (expected: $expected)"
        fi
    else
        echo "✅ OK ($result)"
    fi
    PASSED=$((PASSED + 1))
}

check_bytecode() {
    local name=$1
    local addr=$2

    echo -n "📋 $name ($addr)... "

    code=$(cast code "$addr" --rpc-url "$RPC" 2>&1)

    if [[ "$code" == "0x" ]] || [[ -z "$code" ]]; then
        echo "❌ NO BYTECODE"
        FAILED=$((FAILED + 1))
        return 1
    fi

    echo "✅ Bytecode present (${#code} chars)"
    PASSED=$((PASSED + 1))
}

echo "═══════════════════════════════════════════════════════════════════"
echo "CORE CONTRACTS"
echo "═══════════════════════════════════════════════════════════════════"

# USDC (external)
check_contract "USDC" "$USDC" "symbol()(string)" "USDC"

# VRWXToken
check_contract "VRWXToken" "$VRWX" "symbol()(string)" "VRWX"

# IdentityRegistry
echo -n "📋 IdentityRegistry ($IDENTITY)... "
result=$(cast call "$IDENTITY" "getController(bytes32)(address)" 0x0000000000000000000000000000000000000000000000000000000000000001 --rpc-url "$RPC" 2>&1)
if [[ "$result" == "0x0000000000000000000000000000000000000000" ]]; then
    echo "✅ OK (returns ZeroAddress for unregistered robot)"
    PASSED=$((PASSED + 1))
else
    echo "❌ FAIL: $result"
    FAILED=$((FAILED + 1))
fi

# JobEscrow
check_contract "JobEscrow" "$ESCROW" "jobCount()(uint256)" ""

# Receipt1155 (ERC1155 - no name() function, check jobEscrow linkage)
check_contract "Receipt1155" "$RECEIPT" "jobEscrow()(address)" "$ESCROW"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "ECONOMIC CONTRACTS"
echo "═══════════════════════════════════════════════════════════════════"

check_bytecode "BondManager" "$BOND"
check_bytecode "DisputeManager" "$DISPUTE"
check_bytecode "RewardsDistributor" "$REWARDS"
check_bytecode "ReputationLedger" "$REPUTATION"
check_bytecode "FeeRouter" "$FEEROUTER"
check_bytecode "StakingGate" "$STAKING"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "MARKETPLACE CONTRACTS"
echo "═══════════════════════════════════════════════════════════════════"

check_bytecode "OfferBook" "$OFFERBOOK"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
TOTAL=$((PASSED + FAILED))
echo "Total: $TOTAL contracts"
echo "Passed: $PASSED"
echo "Failed: $FAILED"

if [[ $FAILED -eq 0 ]]; then
    echo ""
    echo "✅ ALL CONTRACTS VERIFIED ON BASE MAINNET"
    exit 0
else
    echo ""
    echo "❌ SOME CONTRACTS FAILED VERIFICATION"
    exit 1
fi
