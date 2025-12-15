# VRWX Architecture

**Source of truth:** `deploy/addresses.base-mainnet.json`

## Overview

VRWX (Verified Robotic Work Exchange) is a protocol for verified job execution by autonomous robots with on-chain settlement.

```
┌─────────────────────────────────────────────────────────────────┐
│                        VRWX Protocol                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Client/Robot                    VRWX API                      │
│   ┌─────────┐                    ┌─────────┐                    │
│   │ Execute │───completion───────▶│ Webhook │                   │
│   │   Job   │   + controllerSig  │/complete│                    │
│   └─────────┘                    └────┬────┘                    │
│                                       │                         │
│                                       ▼                         │
│                              ┌────────────────┐                 │
│                              │  Strict Proof  │                 │
│                              │   Pipeline     │                 │
│                              └───────┬────────┘                 │
│                                      │                          │
│                                      ▼                          │
│                              ┌────────────────┐                 │
│                              │    Relayer     │                 │
│                              └───────┬────────┘                 │
│                                      │                          │
│                                      ▼                          │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │                    Base Mainnet (8453)                   │  │
│   └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Token Model

| Token | Address | Purpose |
|-------|---------|---------|
| **USDC** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Settlement currency |
| **VRWX** | `0x47f81Aa69BA606552201E5b4Ba9827d340fe23A4` | Rewards, fees, staking |

- **Settlement:** Jobs are paid in USDC
- **Rewards:** Robots earn VRWX tokens for quality work
- **Staking:** VRWX staking required for certain operations
- **Fees:** Protocol fees paid in VRWX

## Smart Contracts (Base Mainnet)

Deployed: 2024-12-14
Chain ID: 8453
Deployer: `0x81a3D02D0E04ce529c8F5960d9a71c8f47fFb3df`

### Core Layer

| Contract | Address | Description |
|----------|---------|-------------|
| **escrow** | `0x7B55CD2614d42E328622E13E2F04c6A4044dCf8B` | Job lifecycle, escrow, completion settlement |
| **identity** | `0x1f9Aa1738428a8b81798C79F571a61f0C2A8658b` | Robot ↔ Controller mapping |
| **receipt** | `0xe7980B02E665AaB62fA5e5Bc10D35c7823ee1B04` | ERC-721 completion receipts |

### Economic Layer

| Contract | Address | Description |
|----------|---------|-------------|
| **bond** | `0xA0d9224a0528695383ECF8d1a7F62b5E32de79C4` | Robot bond management |
| **feeRouter** | `0xf55c9F57487039112eAEeDbaeB45eeA8E3d536fe` | Fee distribution |
| **rewardsDistributor** | `0xe785570963a9218bb51A2Cd5c23369Fc7e19FB78` | VRWX reward distribution |
| **stakingGate** | `0x923A967Ae7e7bB1bBb90a87ef9877b645CC16437` | Staking requirements |

### Marketplace Layer

| Contract | Address | Description |
|----------|---------|-------------|
| **offerBook** | `0x3523C4E90CD3f5B58Fb016D003145E178560376b` | Job offers marketplace |
| **dispute** | `0x0E1850DEe87Cb9D870DB388292044EFA120A6d5E` | Dispute resolution |
| **reputationLedger** | `0xfF69b1389CcA9caCA301f0a6b63cAcbc62419F85` | Robot reputation tracking |

## Job Lifecycle

```
1. CREATE JOB
   Buyer → escrow.createJob(robotId, jobSpec, price)
   └─▶ USDC transferred to escrow
   └─▶ Status: CREATED

2. FUND JOB
   Buyer → escrow.fundJob(jobId)
   └─▶ Status: FUNDED

3. EXECUTE
   Robot executes job off-chain
   └─▶ Collects execution data, artifacts

4. COMPLETE
   Robot → API /connectors/webhook/complete
   └─▶ API builds ExecutionManifest
   └─▶ API computes qualityScore, workUnits
   └─▶ API verifies EIP-712 signature
   └─▶ Relayer submits to escrow.submitCompletionV2()
   └─▶ Status: COMPLETED
   └─▶ USDC released to robot controller

5. SETTLE (optional dispute window)
   After settleAfter timestamp
   └─▶ escrow.settle(jobId)
   └─▶ Final settlement + receipt NFT minted
```

## API Endpoints

### POST /connectors/webhook/complete

```json
// Request
{
  "jobId": 1001,
  "robotId": "0x...",
  "serviceType": "inspection",
  "controllerSig": "0x...",
  "inspection": { "coverageVisited": 45, "coverageTotal": 50 }
}

// Response (relay mode)
{
  "accepted": true,
  "txHash": "0x...",
  "blockNumber": 12345,
  "manifestHash": "0x...",
  "hashMatch": true,
  "relayMode": "relay"
}
```

### Query Params
- `?mode=selfSubmit` - Return typedData for client signing
- `?dryRun=1` - Validate without storage/tx
- `?chainId=8453` - Override chain

## Service Types

| Type | Quality Calculation | Work Units |
|------|---------------------|------------|
| `inspection` | Coverage % + artifacts | coverageVisited |
| `security_patrol` | Checkpoint % + dwell time | checkpoints visited |
| `delivery` | Pickup + dropoff proofs | 1 per delivery |

## Security Model

1. **Identity Verification**
   - Robot registered in IdentityRegistry
   - Controller address verified on-chain
   - EIP-712 signature required

2. **Anti-Replay**
   - `claimUsed[hash]` on-chain
   - Idempotency guard in API
   - jobId uniqueness

3. **Triple Equality**
   ```
   controller (provided) == signer == registry.controllerOf(robotId)
   ```

4. **Strict Proof Mode**
   - Manifest stored to R2/S3
   - Hash recomputed from storage
   - Zero tolerance for mismatches

## Directory Structure

```
vrwx/
├── contracts/          # Solidity (Foundry)
├── api/                # Fastify API
├── packages/
│   ├── sdk/            # Client SDK
│   └── proof/          # Manifest hashing
├── deploy/
│   └── addresses.base-mainnet.json  # SOURCE OF TRUTH
├── schemas/
│   └── ExecutionManifest.schema.json
└── docs/
    ├── ARCHITECTURE.md (this file)
    ├── CONFIG.md
    └── RUNBOOK.md
```
