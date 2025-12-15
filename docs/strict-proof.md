# Strict Proof Mode (M4.2)

VRWX enforces strict proof verification by default to ensure zero economic errors.

## Overview

When `VRWX_STRICT_PROOF=1` (default), the API pipeline performs:

1. **Schema Validation** - JobSpec must match current schema version
2. **Manifest Construction** - Builds ExecutionManifest with version fields
3. **Deterministic Hashing** - Canonicalizes JSON and computes keccak256 hash
4. **Storage Verification** - Uploads manifest and verifies stored hash matches
5. **Value Recomputation** - Never trusts declarative quality/workUnits

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VRWX_STRICT_PROOF` | `1` | Enable strict proof mode |
| `VRWX_STORAGE_REQUIRED` | `1` | Require successful storage upload |
| `VRWX_ACCEPT_SCHEMA_VERSIONS` | `2025-12-15,2025-12-01` | Accepted schema versions |

## Pipeline Steps

```
A) Validate request auth + rate limit
B) Validate serviceType
C) Build ExecutionManifest with:
   - manifestVersion: "2.0"
   - schemaVersion: "2025-12-15"
   - serviceModuleVersion: "1.0"
D) Canonicalize manifest (sorted keys, deterministic JSON)
E) Compute manifestHash = keccak256(canonical)
F) Upload manifest -> manifestUrl
G) Verify: recompute hash from stored bytes == manifestHash
H) Recompute qualityScore/workUnits (NEVER trust client values)
I) Build completion claim
J) Pass through idempotency guard
K) Return response
```

## Error Handling

In strict mode, failures result in:
- Storage upload failure: 502 + `STORAGE_UPLOAD_FAILED`
- Hash mismatch: 400 + `HASH_MISMATCH`
- Schema rejected: 400 + `SCHEMA_VERSION_REJECTED`

All errors are logged to DLQ for replay.

## Disabling Strict Mode

**Not recommended for production.** Set:
```
VRWX_STRICT_PROOF=0
VRWX_STORAGE_REQUIRED=0
```
