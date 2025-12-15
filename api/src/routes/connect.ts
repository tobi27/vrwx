/**
 * Connect Routes
 * M4.5: Plug-and-Play Backend
 *
 * Server-rendered page for one-time secrets download
 */

import { FastifyPluginAsync } from 'fastify';
import { queryOne, execute } from '../db/index.js';
import { decryptSecrets, ConnectTokenRecord } from './onboard.js';
import { rotateApiKey, getRobot } from '../middleware/auth.js';
import { config } from '../config.js';

// ============================================================================
// Routes
// ============================================================================

export const connectRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /connect/:token
   *
   * Server-rendered page with API key shown once, Robot Key File in Advanced
   */
  fastify.get<{ Params: { token: string } }>('/:token', async (request, reply) => {
    const { token } = request.params;

    // Find token record
    const tokenRecord = queryOne<ConnectTokenRecord>(
      'SELECT * FROM connect_tokens WHERE token = ?',
      [token]
    );

    if (!tokenRecord) {
      return reply.status(404).type('text/html').send(renderError('Token not found', 'This connect link is invalid or has already been used.'));
    }

    // Check expiration
    if (Date.now() > tokenRecord.expires_at) {
      return reply.status(410).type('text/html').send(renderError('Token expired', 'This connect link has expired. Please create a new robot.'));
    }

    const baseUrl = config.API_BASE_URL || `http://localhost:${config.PORT}`;

    // Get robot info
    const robot = getRobot(tokenRecord.robot_id);

    // Decrypt secrets to show apiKey (one-time)
    let apiKey: string | null = null;
    let hasControllerKey = false;
    const alreadyViewed = tokenRecord.downloaded_at !== null;

    if (tokenRecord.secrets_json && !alreadyViewed) {
      const secrets = decryptSecrets(tokenRecord.secrets_json) as Record<string, string> | null;
      if (secrets) {
        apiKey = secrets.apiKey || null;
        hasControllerKey = !!secrets.controllerPrivateKey;

        // Mark as viewed (apiKey shown once) - but DON'T clear secrets_json yet
        // (user might still want to download Robot Key File in strict mode)
        execute(
          'UPDATE connect_tokens SET downloaded_at = ? WHERE id = ?',
          [Date.now(), tokenRecord.id]
        );
      }
    }

    // Check if Robot Key File still available (for Advanced section)
    const robotKeyFileAvailable = tokenRecord.secrets_json !== null && hasControllerKey;

    // Render page
    return reply.type('text/html').send(renderConnectPage({
      token,
      robotId: tokenRecord.robot_id,
      controllerAddress: robot?.controller_address || 'Unknown',
      apiKey,
      alreadyViewed,
      robotKeyFileAvailable,
      strictMode: config.VRWX_STRICT_PROOF,
      baseUrl,
    }));
  });

  /**
   * GET /connect/:token/secrets
   *
   * Download secrets as JSON file (one-time only)
   */
  fastify.get<{ Params: { token: string } }>('/:token/secrets', async (request, reply) => {
    const { token } = request.params;

    // Find token record
    const tokenRecord = queryOne<ConnectTokenRecord>(
      'SELECT * FROM connect_tokens WHERE token = ?',
      [token]
    );

    if (!tokenRecord) {
      return reply.status(404).send({ error: 'Token not found' });
    }

    // Check expiration
    if (Date.now() > tokenRecord.expires_at) {
      return reply.status(410).send({ error: 'Token expired' });
    }

    // Check if already downloaded
    if (tokenRecord.downloaded_at !== null) {
      return reply.status(409).send({ error: 'Secrets already downloaded', message: 'Robot Key File can only be downloaded once.' });
    }

    // Check if secrets exist
    if (!tokenRecord.secrets_json) {
      return reply.status(410).send({ error: 'Secrets not available' });
    }

    // Decrypt secrets
    const secrets = decryptSecrets(tokenRecord.secrets_json);
    if (!secrets) {
      return reply.status(500).send({ error: 'Failed to decrypt secrets' });
    }

    // Mark as downloaded and clear secrets from DB
    execute(
      'UPDATE connect_tokens SET downloaded_at = ?, secrets_json = NULL WHERE id = ?',
      [Date.now(), tokenRecord.id]
    );

    fastify.log.info(`[CONNECT] Secrets downloaded for robot ${tokenRecord.robot_id}`);

    // Return as downloadable JSON
    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="robot-key-${tokenRecord.robot_id.slice(0, 10)}.json"`)
      .send(secrets);
  });

  /**
   * POST /connect/:token/rotate
   *
   * Rotate API key (keeps same robot/controller)
   */
  fastify.post<{ Params: { token: string } }>('/:token/rotate', async (request, reply) => {
    const { token } = request.params;

    // Find token record
    const tokenRecord = queryOne<ConnectTokenRecord>(
      'SELECT * FROM connect_tokens WHERE token = ?',
      [token]
    );

    if (!tokenRecord) {
      return reply.status(404).send({ error: 'Token not found' });
    }

    // Rotate API key
    const result = rotateApiKey(tokenRecord.tenant_id);

    if (!result.success) {
      return reply.status(500).send({ error: result.error });
    }

    fastify.log.info(`[CONNECT] API key rotated for tenant ${tokenRecord.tenant_id}`);

    // Return new key (one-time display)
    return {
      success: true,
      apiKey: result.apiKey,
      warning: 'Save this API key now. It will not be shown again.',
    };
  });
};

// ============================================================================
// HTML Templates
// ============================================================================

function renderConnectPage(opts: {
  token: string;
  robotId: string;
  controllerAddress: string;
  apiKey: string | null;
  alreadyViewed: boolean;
  robotKeyFileAvailable: boolean;
  strictMode: boolean;
  baseUrl: string;
}): string {
  const { token, robotId, controllerAddress, apiKey, alreadyViewed, robotKeyFileAvailable, strictMode, baseUrl } = opts;

  // Default snippet WITHOUT controllerSig (not required in non-strict mode)
  const snippet = `curl -X POST ${baseUrl}/connectors/webhook/complete \\
  -H "Authorization: Bearer ${apiKey || '<API_KEY>'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jobId": 1,
    "serviceType": "inspection",
    "inspection": { "coverageVisited": 45, "coverageTotal": 50 }
  }'`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VRWX - Connect Robot</title>
  <style>
    :root {
      --bg: #0a0a0a;
      --fg: #e5e5e5;
      --accent: #3b82f6;
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
      --border: #333;
      --mono: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--mono);
      background: var(--bg);
      color: var(--fg);
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 700px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: #888; margin-bottom: 2rem; }
    .card {
      background: #111;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .card h2 { font-size: 1rem; margin-bottom: 1rem; color: var(--accent); }
    .info { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.875rem; }
    .info .label { color: #888; }
    .info .value { color: var(--fg); word-break: break-all; }
    button {
      background: var(--accent);
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      font-family: var(--mono);
      cursor: pointer;
      font-size: 0.875rem;
      width: 100%;
      margin-bottom: 0.5rem;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button.secondary { background: #333; }
    button.warning { background: var(--warning); }
    .success { color: var(--success); }
    .warning-text { color: var(--warning); }
    .error { color: var(--error); }
    pre {
      background: #0a0a0a;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1rem;
      font-size: 0.75rem;
      overflow-x: auto;
      white-space: pre-wrap;
    }
    details { margin-top: 1rem; }
    summary { cursor: pointer; color: #888; font-size: 0.875rem; }
    .hidden { display: none; }
    .alert {
      padding: 0.75rem;
      border-radius: 4px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }
    .alert.info { background: rgba(59, 130, 246, 0.2); border: 1px solid var(--accent); }
    .alert.warning { background: rgba(245, 158, 11, 0.2); border: 1px solid var(--warning); }
    .alert.error { background: rgba(239, 68, 68, 0.2); border: 1px solid var(--error); }
  </style>
</head>
<body>
  <div class="container">
    <h1>VRWX</h1>
    <p class="subtitle">Robot Connection</p>

    <div class="card">
      <h2>Robot Info</h2>
      <div class="info">
        <span class="label">Robot ID:</span>
        <span class="value">${robotId.slice(0, 20)}...</span>
      </div>
      <div class="info">
        <span class="label">Controller:</span>
        <span class="value">${controllerAddress}</span>
      </div>
    </div>

    <div class="card">
      <h2>1. Your API Key</h2>
      ${apiKey ? `
        <div class="alert info">
          <strong>Save this now!</strong> This API key is shown <strong>once</strong>.
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem;">
          <code id="apiKey" style="flex: 1; padding: 0.75rem; background: #0a0a0a; border: 1px solid var(--border); border-radius: 4px; word-break: break-all;">${apiKey}</code>
          <button class="secondary" style="width: auto; margin: 0;" onclick="copyApiKey()">Copy</button>
        </div>
        <div id="apikey-status" class="hidden success" style="text-align: center;">API Key copied!</div>
      ` : alreadyViewed ? `
        <div class="alert warning">
          <strong>Already Viewed</strong><br>
          The API key was shown when you first visited this page. If you lost it, use "Rotate API Key" below.
        </div>
      ` : `
        <div class="alert error">
          <strong>Not Available</strong><br>
          API key is not available for this token.
        </div>
      `}
    </div>

    <div class="card">
      <h2>2. Integration Snippet</h2>
      <pre id="snippet">${snippet}</pre>
      <button class="secondary" onclick="copySnippet()">Copy to Clipboard</button>
      <div id="copy-status" class="hidden success" style="margin-top: 0.5rem; text-align: center;">Copied!</div>
    </div>

    <details>
      <summary>Advanced Options${strictMode ? ' (Strict Mode)' : ''}</summary>
      ${strictMode && robotKeyFileAvailable ? `
      <div class="card" style="margin-top: 1rem;">
        <h2>Robot Key File (Strict Mode)</h2>
        <p style="font-size: 0.75rem; color: #888; margin-bottom: 1rem;">
          For strict mode, you need to sign completions with the controller key.
          Download this file to get the private key for signing.
        </p>
        <button onclick="downloadSecrets()">Download Robot Key File</button>
      </div>
      ` : ''}
      <div class="card" style="margin-top: 1rem;">
        <h2>Robot Config (Non-Secret)</h2>
        <p style="font-size: 0.75rem; color: #888; margin-bottom: 1rem;">
          This config file contains non-sensitive information and can be re-downloaded anytime.
        </p>
        <a href="${baseUrl}/v1/robot-config/${robotId}" download>
          <button class="secondary">Download robot-config.json</button>
        </a>
      </div>
      <div class="card">
        <h2>Rotate API Key</h2>
        <p style="font-size: 0.75rem; color: #888; margin-bottom: 1rem;">
          Generate a new API key. Your old key will be revoked.
          Robot and controller stay the same.
        </p>
        <button class="warning" onclick="rotateKey()">Rotate API Key</button>
        <div id="rotate-result" class="hidden" style="margin-top: 1rem;"></div>
      </div>
    </details>
  </div>

  <script>
    function copyApiKey() {
      const apiKey = document.getElementById('apiKey').textContent;
      navigator.clipboard.writeText(apiKey).then(() => {
        const status = document.getElementById('apikey-status');
        status.classList.remove('hidden');
        setTimeout(() => status.classList.add('hidden'), 2000);
      });
    }

    function downloadSecrets() {
      window.location.href = '/connect/${token}/secrets';
      // Refresh page after download to update UI
      setTimeout(() => window.location.reload(), 2000);
    }

    function copySnippet() {
      const snippet = document.getElementById('snippet').textContent;
      navigator.clipboard.writeText(snippet).then(() => {
        const status = document.getElementById('copy-status');
        status.classList.remove('hidden');
        setTimeout(() => status.classList.add('hidden'), 2000);
      });
    }

    async function rotateKey() {
      if (!confirm('Are you sure? Your current API key will be revoked.')) return;

      const resultDiv = document.getElementById('rotate-result');
      resultDiv.classList.remove('hidden');
      resultDiv.innerHTML = 'Rotating...';

      try {
        const res = await fetch('/connect/${token}/rotate', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
          resultDiv.innerHTML = '<div class="alert info"><strong>New API Key:</strong><br><code>' + data.apiKey.key + '</code><br><br><span class="warning-text">Save this now! It won\\'t be shown again.</span></div>';
        } else {
          resultDiv.innerHTML = '<div class="alert error">Error: ' + (data.error || 'Unknown error') + '</div>';
        }
      } catch (err) {
        resultDiv.innerHTML = '<div class="alert error">Error: ' + err.message + '</div>';
      }
    }
  </script>
</body>
</html>`;
}

function renderError(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VRWX - Error</title>
  <style>
    :root { --bg: #0a0a0a; --fg: #e5e5e5; --error: #ef4444; --mono: 'SF Mono', 'Menlo', monospace; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--mono); background: var(--bg); color: var(--fg); min-height: 100vh; padding: 2rem; display: flex; align-items: center; justify-content: center; }
    .error-box { text-align: center; }
    h1 { color: var(--error); margin-bottom: 1rem; }
    p { color: #888; }
    a { color: var(--error); }
  </style>
</head>
<body>
  <div class="error-box">
    <h1>${title}</h1>
    <p>${message}</p>
    <p style="margin-top: 2rem;"><a href="/">← Back to Home</a></p>
  </div>
</body>
</html>`;
}
