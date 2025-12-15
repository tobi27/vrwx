# Idempotency (M4.2)

VRWX implements exactly-once settlement using idempotency keys.

## Key Strategy

```
key = base:{chainId}:job:{jobId}
```

The idempotency key is based on job ID, NOT manifest hash. This means:
- Same `jobId` = same response, even with different request bodies
- 10x same `jobId` = cached response from first successful completion
- Different `jobId` = new completion processed

## Behavior

| Existing Status | Behavior |
|-----------------|----------|
| None | Insert PENDING, execute handler, mark COMPLETED/FAILED |
| PENDING | Return 202 (processing) with `retryAfterMs` |
| COMPLETED | Return cached response (200) |
| FAILED | Delete old record, retry as new |

## Database Schema

```sql
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  status TEXT CHECK(status IN ('PENDING','COMPLETED','FAILED')) NOT NULL,
  request_hash TEXT,
  manifest_hash TEXT,
  response_json TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ttl_expires_at INTEGER
);
```

## API Endpoints

### Check Status
```
GET /connectors/webhook/status/:jobId?chainId=8453
```

Response:
```json
{
  "idempotencyKey": "base:8453:job:1001",
  "status": "COMPLETED",
  "manifestHash": "0x...",
  "cached": true,
  "response": { ... }
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `IDEMPOTENCY_TTL_MS` | 86400000 (24h) | TTL for completed records |
| `DEFAULT_CHAIN_ID` | 8453 | Default chain ID (Base Mainnet) |

## Cleanup

Expired records are cleaned up by:
```typescript
cleanupExpiredIdempotency()
```

This removes records past their TTL (except PENDING).
