import type { PendingElicitation } from "../elicitation/types.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderElicitForm(pending: PendingElicitation): string {
  const apiUrl = escapeHtml(pending.apiUrl);
  const reason = pending.reason === "reauth" ? "Re-authenticate" : "Connect";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenFGA Authentication</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 520px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    label { display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; }
    input { width: 100%; padding: 0.5rem; box-sizing: border-box; }
    fieldset { border: 1px solid #ccc; border-radius: 6px; padding: 1rem; margin: 1rem 0; }
    legend { font-weight: 600; padding: 0 0.25rem; }
    button[type="submit"] { margin-top: 1rem; background: #2563eb; color: #fff; border: none; padding: 0.65rem 1rem; border-radius: 6px; cursor: pointer; width: 100%; font-size: 1rem; }
    button[type="submit"]:hover { background: #1d4ed8; }
    .context { background: #f3f4f6; padding: 0.75rem; border-radius: 6px; font-size: 0.95rem; }
    .hint { color: #4b5563; font-size: 0.9rem; }
    .method-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.5rem; }
    .method-btn {
      display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
      padding: 0.85rem 0.5rem; border: 2px solid #d1d5db; border-radius: 8px;
      background: #fff; color: #374151; cursor: pointer; font: inherit; font-size: 0.9rem;
      transition: border-color 0.15s, background 0.15s, color 0.15s;
    }
    .method-btn:hover { border-color: #93c5fd; background: #f8fafc; }
    .method-btn[aria-pressed="true"] {
      border-color: #2563eb; background: #eff6ff; color: #1d4ed8;
    }
    .method-btn svg { width: 1.5rem; height: 1.5rem; stroke: currentColor; fill: none; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
    .method-label { font-weight: 600; text-align: center; line-height: 1.25; }
  </style>
</head>
<body>
  <h1>${escapeHtml(reason)} to OpenFGA</h1>
  <p class="context"><strong>Target API:</strong> ${apiUrl}</p>
  <p class="hint">Credentials are stored server-side only and never sent through the MCP client or model.</p>
  <form method="POST" action="/auth/elicit/${escapeHtml(pending.elicitationId)}">
    <input type="hidden" name="csrf" value="${escapeHtml(pending.csrfToken)}" />
    <input type="hidden" id="method" name="method" value="api_token" />
    <fieldset>
      <legend>Authentication method</legend>
      <div class="method-switch" role="group" aria-label="Authentication method">
        <button type="button" class="method-btn" id="method_api_token" data-method="api_token" aria-pressed="true">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 10V8a5 5 0 0 1 10 0v2" />
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <circle cx="12" cy="15" r="1.5" />
            <path d="M12 16.5V18" />
          </svg>
          <span class="method-label">Pre-shared key</span>
        </button>
        <button type="button" class="method-btn" id="method_client_credentials" data-method="client_credentials" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3l8 4v6c0 5-3.5 8-8 8s-8-3-8-8V7l8-4z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span class="method-label">OIDC client credentials</span>
        </button>
      </div>
    </fieldset>
    <div id="api_token_fields">
      <label for="token">Pre-shared key</label>
      <input id="token" name="token" type="password" autocomplete="off" />
    </div>
    <div id="oidc_fields" hidden>
      <label for="issuer">Issuer</label>
      <input id="issuer" name="issuer" type="url" placeholder="https://issuer.example.com/" />
      <label for="client_id">Client ID</label>
      <input id="client_id" name="client_id" type="text" autocomplete="off" />
      <label for="client_secret">Client secret</label>
      <input id="client_secret" name="client_secret" type="password" autocomplete="off" />
      <label for="audience">Audience (optional)</label>
      <input id="audience" name="audience" type="text" value="${apiUrl}" />
      <label for="scopes">Scopes (optional)</label>
      <input id="scopes" name="scopes" type="text" placeholder="openid profile" />
    </div>
    <button type="submit">Submit credentials</button>
  </form>
  <script>
    const methodInput = document.getElementById('method');
    const methodButtons = document.querySelectorAll('.method-btn');
    const tokenFields = document.getElementById('api_token_fields');
    const oidcFields = document.getElementById('oidc_fields');

    function syncFields() {
      const isToken = methodInput.value === 'api_token';
      tokenFields.hidden = !isToken;
      oidcFields.hidden = isToken;
      document.getElementById('token').required = isToken;
      ['issuer', 'client_id', 'client_secret'].forEach(id => {
        document.getElementById(id).required = !isToken;
      });
      methodButtons.forEach(btn => {
        const selected = btn.dataset.method === methodInput.value;
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    }

    methodButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        methodInput.value = btn.dataset.method;
        syncFields();
      });
    });

    syncFields();
  </script>
</body>
</html>`;
}

export function renderSuccessPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Authentication complete</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 520px; margin: 2rem auto; padding: 0 1rem; text-align: center; }
    .ok { background: #dcfce7; color: #166534; padding: 1rem; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="ok">
    <h1>Success</h1>
    <p>Credentials saved. Return to your agent and retry the tool call with the same arguments.</p>
  </div>
</body>
</html>`;
}

export function renderErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Authentication error</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 520px; margin: 2rem auto; padding: 0 1rem; }
    .err { background: #fee2e2; color: #991b1b; padding: 1rem; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="err">
    <h1>Error</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}
