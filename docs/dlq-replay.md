# Dead Letter Queue (DLQ) Replay

VRWX stores failed completions in a DLQ for later replay.

## Event Types

| Type | Description |
|------|-------------|
| `HASH_MISMATCH` | Stored hash != computed hash |
| `UPLOAD_FAIL` | Storage upload failed |
| `SCHEMA_FAIL` | Schema validation failed |
| `TX_FAIL` | Transaction submission failed |
| `DISPUTE_FAIL` | Dispute handling failed |
| `VALIDATION_FAIL` | Request validation failed |

## Database Schema

```sql
CREATE TABLE dlq_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT CHECK(type IN ('HASH_MISMATCH','UPLOAD_FAIL',...)) NOT NULL,
  payload TEXT NOT NULL,
  reason TEXT,
  error_code TEXT,
  error_stack TEXT,
  connector_type TEXT,
  service_type TEXT,
  job_id INTEGER,
  manifest_hash TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at INTEGER,
  last_retry_at INTEGER,
  resolved_at INTEGER,
  resolution_type TEXT,
  resolution_notes TEXT,
  created_at INTEGER NOT NULL
);
```

## Replay Script

```bash
# Replay all due events
pnpm dlq:replay

# Dry run (preview)
pnpm dlq:replay --dry-run

# Replay specific type
pnpm dlq:replay --type=UPLOAD_FAIL

# Replay specific event
pnpm dlq:replay --id=123
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DLQ_MAX_RETRIES` | 3 | Maximum retry attempts |
| `DLQ_BACKOFF_BASE_MS` | 60000 | Base backoff (1 min) |

Backoff is exponential: `base * 2^retry_count`

## Metrics

Available at `/metrics/prometheus`:
```
vrwx_dlq_events_total{type="UPLOAD_FAIL"}
vrwx_dlq_unresolved
vrwx_dlq_pending_retry
vrwx_dlq_exceeded_retries
```

## Manual Resolution

```typescript
import { markResolved } from './services/dlq.js';

// Mark as manually resolved
markResolved(eventId, 'MANUAL', 'Fixed by operator');

// Mark as skipped
markResolved(eventId, 'SKIPPED', 'Duplicate event');
```
