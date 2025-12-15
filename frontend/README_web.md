# VRWX Web Client

Premium marketplace frontend for the VRWX Robotic Work Protocol.

## Stack
- React 18 + TypeScript
- TailwindCSS (Styling)
- Lucide React (Icons)
- React Router (Client-side routing)

## Features
- **Proof Verification**: Client-side re-computation of manifest hashes to verify against on-chain data.
- **Marketplace**: Browse and purchase robotic services.
- **Webhook Simulator**: Test robot connectivity and receipt minting flow.

## Setup
1. `pnpm install`
2. `pnpm dev`

## Connecting to Backend
This frontend is configured to connect to a local or remote Fastify backend.

1. **Configure URL**:
   Edit the `.env` file at the root:
   ```bash
   NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
   ```
   
2. **CORS (Important)**:
   Your backend must allow requests from the frontend origin (e.g., `http://localhost:5173`).
   In your Fastify backend, ensure `@fastify/cors` is registered:
   ```javascript
   await fastify.register(import('@fastify/cors'), { 
     origin: true // or 'http://localhost:5173'
   })
   ```

3. **Status Check**:
   Look at the footer bar in the app.
   - **LIVE_UPLINK (Green)**: Connected to real backend.
   - **DEMO_MODE (Yellow)**: Backend unreachable (using mock data).

## Architecture
- `/lib/proof.ts`: Core cryptographic logic (Canonicalization + Hashing).
- `/lib/api.ts`: API client with mock fallbacks for demo purposes.
