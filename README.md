# VRWX - Verified Robotic Work Exchange

On-chain settlement protocol for verified robotic work on Base Mainnet.

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Build contracts
cd contracts && forge build

# 3. Run tests
forge test

# 4. Start API (relay mode)
RELAYER_PRIVATE_KEY=0x... pnpm --filter api dev
```

## Deployed Contracts (Base Mainnet)

| Contract | Address |
|----------|---------|
| JobEscrow | `0x7B55CD2614d42E328622E13E2F04c6A4044dCf8B` |
| IdentityRegistry | `0x1f9Aa1738428a8b81798C79F571a61f0C2A8658b` |
| Receipt1155 | `0xe7980B02E665AaB62fA5e5Bc10D35c7823ee1B04` |
| BondManager | `0xA0d9224a0528695383ECF8d1a7F62b5E32de79C4` |
| USDC (settlement) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| VRWX Token | `0x47f81Aa69BA606552201E5b4Ba9827d340fe23A4` |

Full addresses: [`deploy/addresses.base-mainnet.json`](deploy/addresses.base-mainnet.json)

## Architecture

```
vrwx/
├── contracts/       # Solidity (Foundry) - JobEscrow, Receipt1155, Identity
├── api/             # Fastify API - webhook, relay, DLQ
├── packages/
│   ├── proof/       # Deterministic manifest hashing
│   └── conformance/ # Service conformance tests
├── sdk/             # TypeScript SDK - signing, builders
├── schemas/         # JSON Schemas - JobSpec, ExecutionManifest
├── services/        # Service type modules
└── docs/            # Technical documentation
```

## Job Lifecycle

```
1. Robot Registration  → IdentityRegistry.registerRobot()
2. Bond Deposit        → BondManager.deposit()
3. Job Creation        → JobEscrow.createJob()
4. Job Funding         → JobEscrow.fund() [USDC]
5. Work Execution      → Off-chain
6. Completion Submit   → JobEscrow.submitCompletion() [EIP-712 signed]
7. Settlement          → JobEscrow.settle() [after 24h challenge window]
```

## Integration (10 min)

### 1. Register Robot
```typescript
import { ethers } from 'ethers';

const robotId = ethers.keccak256(ethers.toUtf8Bytes('my-robot-001'));
await identityRegistry.registerRobot(robotId, controllerAddress, '0x');
```

### 2. Deposit Bond
```typescript
await usdc.approve(bondManager.address, bondAmount);
await bondManager.deposit(robotId, bondAmount);
```

### 3. Submit Completion (via API)
```bash
curl -X POST http://localhost:3000/connectors/webhook/complete \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": 1,
    "robotId": "0x...",
    "serviceType": "inspection",
    "controllerSig": "0x...",
    "inspection": { "coverageVisited": 45, "coverageTotal": 50 }
  }'
```

## Conformance Tests

```bash
# Run all conformance tests
pnpm conformance:all

# Dry run
pnpm conformance:all --dry-run
```

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System overview
- [CONFIG.md](docs/CONFIG.md) - API configuration
- [RUNBOOK.md](docs/RUNBOOK.md) - Operations guide
- [strict-proof.md](docs/strict-proof.md) - Proof verification
- [conformance.md](docs/conformance.md) - Service conformance
- [idempotency.md](docs/idempotency.md) - Request idempotency
- [dlq-replay.md](docs/dlq-replay.md) - Dead letter queue

## License

MIT
