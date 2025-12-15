# VRWX API Configuration (M4.3)

Complete configuration reference for VRWX API server.

## Environment Variables

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Environment mode (development/production) |

### Strict Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `VRWX_STRICT_PROOF` | `1` | Enable strict proof verification (0 to disable) |
| `VRWX_STORAGE_REQUIRED` | `1` | Require successful manifest storage (0 to disable) |
| `VRWX_ACCEPT_SCHEMA_VERSIONS` | `2025-12-15,2025-12-01` | Comma-separated list of accepted schema versions |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./data/vrwx.db` | SQLite database path |

### Chain Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_CHAIN_ID` | `8453` | Default chain ID (Base Mainnet) |

### Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_PROVIDER` | `local` | Storage backend: `local`, `r2`, or `s3` |
| `STORAGE_DATA_DIR` | `./data/manifests` | Local storage directory |
| `STORAGE_BASE_URL` | - | Base URL for manifest retrieval |

#### R2 (Cloudflare)

| Variable | Default | Description |
|----------|---------|-------------|
| `R2_ACCOUNT_ID` | - | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | - | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | - | R2 secret access key |
| `R2_BUCKET` | `vrwx-manifests` | R2 bucket name |

#### S3 (AWS)

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | - | AWS access key ID |
| `AWS_SECRET_ACCESS_KEY` | - | AWS secret access key |
| `S3_BUCKET` | `vrwx-manifests` | S3 bucket name |
| `S3_REGION` | `us-east-1` | AWS region |

### Relayer (M4.3)

| Variable | Default | Description |
|----------|---------|-------------|
| `RELAY_MODE` | `relay` | Transaction mode: `relay` (API submits) or `selfSubmit` (client submits) |
| `RELAYER_PRIVATE_KEY` | - | **REQUIRED in relay mode.** Private key for relayer wallet (hex, no 0x prefix) |
| `RPC_URL` | `https://mainnet.base.org` | RPC endpoint for transaction submission |

#### Contract Addresses

| Variable | Default | Description |
|----------|---------|-------------|
| `JOB_ESCROW_ADDRESS` | `0xE15d5a642379D28Af1f36aC0e3C8E6A8f27bd8fd` | JobEscrow contract address |
| `IDENTITY_REGISTRY_ADDRESS` | `0x28f1FA8Cf8f2c408f8dd1E80eC32E7C7B00D456E` | IdentityRegistry contract address |

#### Gas Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `GAS_LIMIT_MULTIPLIER` | `1.2` | Gas limit multiplier (safety margin) |
| `MAX_FEE_PER_GAS_GWEI` | `50` | Max fee per gas in gwei |
| `MAX_PRIORITY_FEE_GWEI` | `1` | Max priority fee in gwei |

### Tenant Billing (M4.3)

| Variable | Default | Description |
|----------|---------|-------------|
| `TENANT_BILLING_MODE` | `onchain` | Billing mode: `onchain` (immediate) or `custodial` (queue if no funds) |
| `CUSTODIAL_QUEUE_ENABLED` | `0` | Enable custodial queue mode |
| `CUSTODIAL_DENY_ON_NO_TERMS` | `0` | Deny requests if no billing terms accepted |

### Idempotency

| Variable | Default | Description |
|----------|---------|-------------|
| `IDEMPOTENCY_TTL_MS` | `86400000` | Idempotency record TTL (24 hours) |

### Dead Letter Queue (DLQ)

| Variable | Default | Description |
|----------|---------|-------------|
| `DLQ_MAX_RETRIES` | `3` | Maximum retry attempts |
| `DLQ_BACKOFF_BASE_MS` | `60000` | Base backoff time (1 minute) |

### Rate Limiting (Future)

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | `0` | Enable rate limiting |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (1 minute) |

## Configuration Modes

### Relay Mode (Default)

In relay mode, the API submits transactions on behalf of controllers:

```bash
RELAY_MODE=relay
RELAYER_PRIVATE_KEY=your_private_key_hex
RPC_URL=https://mainnet.base.org
```

**Flow:**
1. Client sends completion request with `controllerSig` (EIP-712 signature)
2. API verifies signature against IdentityRegistry
3. API submits transaction via relayer wallet
4. API returns `txHash` and `blockNumber`

**Benefits:**
- Zero gas for robot controllers
- Simplified client SDK
- Centralized gas management

### SelfSubmit Mode

In selfSubmit mode, clients submit their own transactions:

```bash
RELAY_MODE=selfSubmit
# OR use ?mode=selfSubmit query param
```

**Flow:**
1. Client sends completion request
2. API returns `typedData` for EIP-712 signing
3. Client signs and submits to JobEscrow directly

**Benefits:**
- Controller has full custody
- No relayer trust required

## Example Configurations

### Development

```bash
# .env.development
NODE_ENV=development
PORT=3000
DATABASE_PATH=./data/vrwx.db
STORAGE_PROVIDER=local
VRWX_STRICT_PROOF=1
RELAY_MODE=selfSubmit  # No relayer in dev
```

### Production (Relay Mode)

```bash
# .env.production
NODE_ENV=production
PORT=3000
DATABASE_PATH=/data/vrwx.db

# Storage
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET=vrwx-manifests-prod

# Relayer
RELAY_MODE=relay
RELAYER_PRIVATE_KEY=your_relayer_private_key
RPC_URL=https://mainnet.base.org

# Strict mode (always enabled in production)
VRWX_STRICT_PROOF=1
VRWX_STORAGE_REQUIRED=1
```

### Production (SelfSubmit Mode)

```bash
# .env.production
NODE_ENV=production
RELAY_MODE=selfSubmit
# ... rest of config
```

## Contract Addresses (Base Mainnet)

Source: `deploy/addresses.base-mainnet.json`

| Contract | Address | Description |
|----------|---------|-------------|
| **stableToken** | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | USDC (settlement) |
| **vrwxToken** | `0x47f81Aa69BA606552201E5b4Ba9827d340fe23A4` | VRWX (rewards/fees/stake) |
| **escrow** | `0x7B55CD2614d42E328622E13E2F04c6A4044dCf8B` | JobEscrow |
| **identity** | `0x1f9Aa1738428a8b81798C79F571a61f0C2A8658b` | IdentityRegistry |
| **receipt** | `0xe7980B02E665AaB62fA5e5Bc10D35c7823ee1B04` | ReceiptNFT |
| **bond** | `0xA0d9224a0528695383ECF8d1a7F62b5E32de79C4` | BondManager |
| **dispute** | `0x0E1850DEe87Cb9D870DB388292044EFA120A6d5E` | DisputeResolver |
| **rewardsDistributor** | `0xe785570963a9218bb51A2Cd5c23369Fc7e19FB78` | RewardsDistributor |
| **reputationLedger** | `0xfF69b1389CcA9caCA301f0a6b63cAcbc62419F85` | ReputationLedger |
| **feeRouter** | `0xf55c9F57487039112eAEeDbaeB45eeA8E3d536fe` | FeeRouter |
| **stakingGate** | `0x923A967Ae7e7bB1bBb90a87ef9877b645CC16437` | StakingGate |
| **offerBook** | `0x3523C4E90CD3f5B58Fb016D003145E178560376b` | OfferBook |

## Security Notes

1. **NEVER commit `RELAYER_PRIVATE_KEY` to source control**
2. Use secret managers (AWS Secrets Manager, HashiCorp Vault, etc.)
3. Rotate relayer key periodically (see RUNBOOK.md)
4. Monitor relayer balance and set alerts
5. Use allowlists for production RPC endpoints
