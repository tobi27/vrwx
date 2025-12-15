# VRWX Operations Runbook (M4.3)

Operational procedures for VRWX API in production.

## Table of Contents

1. [Relayer Key Rotation](#relayer-key-rotation)
2. [Monitoring & Alerts](#monitoring--alerts)
3. [Incident Response](#incident-response)
4. [Backup & Recovery](#backup--recovery)

---

## Relayer Key Rotation

### Why Rotate Keys?

- **Security best practice**: Limit exposure window if key is compromised
- **Compliance**: Many security frameworks require periodic rotation
- **Access control**: When team members leave

### Rotation Schedule

| Environment | Frequency | Method |
|-------------|-----------|--------|
| Production | 90 days | Zero-downtime rotation |
| Staging | 30 days | Standard rotation |
| Development | As needed | Direct replacement |

### Zero-Downtime Rotation Procedure

#### Prerequisites

- New wallet generated and funded with ETH for gas
- Access to secret manager (AWS Secrets Manager, Vault, etc.)
- Blue/green deployment capability

#### Step 1: Generate New Relayer Wallet

```bash
# Generate new wallet (NEVER do this in production terminal)
# Use secure key generation tool

# Verify address
cast wallet address --private-key $NEW_PRIVATE_KEY
```

#### Step 2: Fund New Wallet

```bash
# Transfer ETH from treasury to new relayer
cast send $NEW_RELAYER_ADDRESS \
  --value 0.5ether \
  --rpc-url https://mainnet.base.org \
  --private-key $TREASURY_KEY
```

Recommended initial funding:
- **Production**: 0.5 ETH (monitor and top up)
- **Staging**: 0.1 ETH

#### Step 3: Update Secret Manager

```bash
# AWS Secrets Manager example
aws secretsmanager update-secret \
  --secret-id vrwx/prod/relayer-key \
  --secret-string "{\"RELAYER_PRIVATE_KEY\":\"$NEW_PRIVATE_KEY\"}"
```

#### Step 4: Deploy New Instance

```bash
# Blue/green deployment
# Deploy new instance with new key
kubectl set image deployment/vrwx-api \
  api=vrwx-api:v0.3.0-new-key
```

#### Step 5: Drain Old Instance

```bash
# Mark old instance as not ready
kubectl patch deployment vrwx-api-old \
  -p '{"spec":{"replicas":0}}'
```

#### Step 6: Verify New Relayer

```bash
# Check health endpoint
curl https://api.vrwx.io/health | jq '.relayerAddress'

# Should show new relayer address
```

#### Step 7: Drain Old Wallet (Optional)

```bash
# Transfer remaining ETH from old wallet to treasury
cast send $TREASURY_ADDRESS \
  --value $(cast balance $OLD_RELAYER_ADDRESS) \
  --rpc-url https://mainnet.base.org \
  --private-key $OLD_PRIVATE_KEY
```

### Emergency Key Rotation

If key is compromised:

1. **IMMEDIATELY** disable the old key
2. Generate new key
3. Deploy with `--force` flag
4. Investigate breach
5. Notify affected parties

```bash
# Emergency deployment
kubectl rollout restart deployment/vrwx-api
```

---

## Monitoring & Alerts

### Key Metrics to Monitor

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Relayer ETH Balance | < 0.2 ETH | < 0.05 ETH | Top up immediately |
| Tx Success Rate | < 99% | < 95% | Investigate failures |
| Avg Gas Price | > 50 gwei | > 100 gwei | Review gas settings |
| API Latency (p99) | > 2s | > 5s | Scale or investigate |
| DLQ Depth | > 10 | > 50 | Process DLQ |

### Prometheus Queries

```promql
# Relayer balance (via node exporter or custom metric)
vrwx_relayer_balance_eth

# Transaction success rate
rate(vrwx_relay_tx_success_total[5m]) / rate(vrwx_relay_tx_total[5m])

# Gas used per tx
histogram_quantile(0.95, vrwx_relay_gas_used_bucket)
```

### Grafana Dashboard

Import dashboard from `monitoring/grafana/vrwx-relay.json`

Key panels:
- Relayer wallet balance over time
- Transaction success/failure rates
- Gas price trends
- Completion latency distribution

### Alert Rules

```yaml
# alerts.yaml
groups:
  - name: vrwx-relayer
    rules:
      - alert: RelayerLowBalance
        expr: vrwx_relayer_balance_eth < 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Relayer balance critically low"
          description: "Relayer has {{ $value }} ETH remaining"

      - alert: RelayerTxFailures
        expr: rate(vrwx_relay_tx_failed_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Elevated relay transaction failures"
```

---

## Incident Response

### Runbook: Relay Transaction Failures

**Symptoms:**
- 502 errors from `/connectors/webhook/complete`
- `RELAY_TX_FAILED` errors in logs
- Rising DLQ depth

**Investigation:**

```bash
# 1. Check relayer balance
cast balance $RELAYER_ADDRESS --rpc-url https://mainnet.base.org

# 2. Check recent transactions
cast logs --address $JOB_ESCROW_ADDRESS --from-block -100

# 3. Check API logs
kubectl logs -l app=vrwx-api --tail=100 | grep -i "RELAY"

# 4. Check contract state
cast call $JOB_ESCROW_ADDRESS "paused()(bool)" --rpc-url https://mainnet.base.org
```

**Common Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Relayer out of gas | Top up relayer wallet |
| High gas prices | Increase `MAX_FEE_PER_GAS_GWEI` |
| Contract paused | Contact admin to unpause |
| RPC node issues | Switch to backup RPC |
| Invalid signatures | Check IdentityRegistry state |

### Runbook: Signature Verification Failures

**Symptoms:**
- 400 errors with `SIGNATURE_ERROR`
- `Signature verification failed` in logs

**Investigation:**

```bash
# Check robot registration
cast call $IDENTITY_REGISTRY_ADDRESS \
  "getController(bytes32)(address)" \
  $ROBOT_ID \
  --rpc-url https://mainnet.base.org

# Check robot active status
cast call $IDENTITY_REGISTRY_ADDRESS \
  "isActive(bytes32)(bool)" \
  $ROBOT_ID \
  --rpc-url https://mainnet.base.org
```

**Common Causes:**
- Robot not registered
- Robot deactivated
- Wrong controller signing
- Signature for wrong chain

---

## Backup & Recovery

### Database Backup

```bash
# SQLite backup
sqlite3 /data/vrwx.db ".backup /backup/vrwx-$(date +%Y%m%d).db"

# Or use litestream for continuous replication
litestream replicate /data/vrwx.db s3://vrwx-backups/db
```

### Recovery Procedure

```bash
# 1. Stop API
kubectl scale deployment/vrwx-api --replicas=0

# 2. Restore database
cp /backup/vrwx-latest.db /data/vrwx.db

# 3. Start API
kubectl scale deployment/vrwx-api --replicas=3

# 4. Verify health
curl https://api.vrwx.io/health
```

### Disaster Recovery

RTO: 15 minutes
RPO: 1 hour (with litestream) or last backup

1. Provision new infrastructure
2. Restore secrets from backup
3. Restore database
4. Deploy API
5. Update DNS/load balancer
6. Verify all endpoints

---

## Appendix: Useful Commands

### Check Relayer Status

```bash
# Balance
cast balance $RELAYER_ADDRESS --rpc-url https://mainnet.base.org

# Nonce (pending tx count)
cast nonce $RELAYER_ADDRESS --rpc-url https://mainnet.base.org

# Recent transactions
cast logs --address $RELAYER_ADDRESS --from-block -50
```

### Manual Transaction Submission

```bash
# Only use in emergencies
# Submit completion manually
cast send $JOB_ESCROW_ADDRESS \
  "submitCompletionV2(uint256,bytes32,uint8,uint32,bytes)" \
  $JOB_ID $COMPLETION_HASH $QUALITY_SCORE $WORK_UNITS $SIGNATURE \
  --rpc-url https://mainnet.base.org \
  --private-key $RELAYER_PRIVATE_KEY
```

### Query Job Status

```bash
# Get job info
cast call $JOB_ESCROW_ADDRESS \
  "jobs(uint256)(address,bytes32,bytes32,uint256,uint256,uint8,bytes32,uint256,uint256,uint8,uint32)" \
  $JOB_ID \
  --rpc-url https://mainnet.base.org
```

---

## Contact

- **On-call**: Use PagerDuty rotation
- **Escalation**: #vrwx-incidents Slack channel
- **Security issues**: security@vrwx.io
