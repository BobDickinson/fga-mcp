# OpenFGA Authentication via URL Elicitation

Status: **Draft** — not implemented

Related: [Multi-Server OpenFGA Connections](./multi-server-connections.md) (`connect_server`, `connection_scope`, `allow_dynamic_connections`)

Operator docs: [README](../README.md)

## Summary

When an OpenFGA server requires authentication, **credentials must not pass through the MCP client or model context**. fga-mcp uses MCP **URL-mode elicitation** so the human operator authenticates in a browser out of band. Credentials live **server-side**; agents pass only `server` (fixed direct) or `connection_scope` + `server` (scoped) — never secrets in tool arguments.

This spec covers **third-party authorization** (credentials fga-mcp uses to call the **OpenFGA HTTP API**). It does **not** cover MCP authorization (authenticating the MCP client to fga-mcp); that remains edge proxy / MCP auth / deployment concern.

| Tier | When | Connect | FGA tools |
|------|------|---------|-----------|
| **Fixed direct** | Config `auth` or open FGA | None | `server` only |
| **Fixed scoped** | No config `auth`, FGA requires auth (HTTP) | `connect_server({ server })` | `connection_scope` + `server` |
| **Dynamic** | Arbitrary `api_url` | `connect_server({ api_url })` when `allow_dynamic_connections: true` | `connection_scope` + `server` |

**Transport (v1):** URL elicitation requires **`--transport http`**. Stdio supports config `auth` and open FGA only; otherwise return a clear tool error ([stdio transport policy](#stdio-transport-policy-v1)).

### Agent quick reference

```text
list_servers()

For each fixed server:
  auth_status == "connect_required"?
    yes → connect_server({ server }) → save connection_scope
          → all FGA tools: connection_scope + server
    no  → fixed direct → server only (omit connection_scope)

Need a new arbitrary backend?
  dynamic_connections_enabled == true?
    yes → connect_server({ api_url }) → connection_scope + assigned server
    no  → do not call connect_server({ api_url })

After browser auth: retry the same tool call that returned the elicitation URL.
```

---

## Elicitation response paths (Path A / Path B)

**v1 ships both paths.** They are not alternatives at the product level — every elicitation trigger (`connect_server`, 401 reauth) implements capability-based branching via a single helper (`requestUrlElicitation`). A release without either path is incomplete.

| | **Path A** (MCP-native) | **Path B** (structured fallback) |
|---|---------------------------|----------------------------------|
| **When** | Client declared `capabilities.elicitation.url` at MCP initialize | Client did **not** declare `elicitation.url` (including legacy `elicitation: {}` form-only) |
| **Wire format** | JSON-RPC error on failed `tools/call`: code **`-32042`**, `data.elicitations[]` | Normal `CallToolResult`: `isError: true`, `structuredContent` with `url` + metadata |
| **How fga-mcp emits** | `throw new UrlElicitationRequiredError([{ mode: "url", elicitationId, url, message }])` | `throw new UserError(message, { elicitation_required, elicitation_id, url, reason, message })` |
| **Who opens the URL** | MCP client (spec: consent, secure browser surface) | Agent/host parses `structuredContent.url` and surfaces to user |
| **FastMCP dependency** | Requires [local patch](#fastmcp-gap-and-dependency-strategy) — unpatched FastMCP swallows `-32042` | Works on stock FastMCP — but **not shipped alone** |

Capability is read from `session.clientCapabilities` after initialize — **never guessed**. Same hosted auth UI and pending-store flow for both paths; only the tool response shape differs.

See [Error surface (v1)](#error-surface-v1) for exact JSON payloads.

---

## Problem and goals

### Today

`connect_server` accepts credential fields as **tool parameters** (to be **removed** when elicitation ships):

| Parameter | Purpose |
|-----------|---------|
| `api_token` | Pre-shared key |
| `client_id`, `client_secret`, `issuer`, `audience` | OIDC client credentials |

Those values flow through agent conversation, MCP client logs, and tool-call history. MCP explicitly discourages this for sensitive data.

Fixed servers may include an optional **`auth`** object in the FGA config — operator-supplied at deploy time ([Server auth shape](#server-auth-shape)).

### Goals

- **Never** pass OpenFGA secrets through tool arguments or model context.
- **Scoped paths** (fixed scoped + dynamic): elicit at `connect_server`; store creds in **`DynamicScopeStore`** keyed by **`connection_scope`**.
- **Fixed direct:** config `auth` or open FGA — no elicitation, no scope.
- **401 at runtime:** refresh from config (fixed direct) or re-elicit (scoped) — see [Runtime auth errors (401)](#runtime-auth-errors-401).

---

## Routing model

Elicited credentials for **fixed scoped** and **dynamic** servers live in **`DynamicScopeStore`** (same scope store, same isolation rules). **`connection_scope`** is the application session handle — explicit in tool arguments, aligned with [multi-server connections](./multi-server-connections.md#why-connection_scope) and stateless MCP (SEP-2567). No `Mcp-Session-Id`, no separate overlay store.

### Scope store lifecycle

Create **`DynamicScopeStore`** when **either**:

- `allow_dynamic_connections: true`, **or**
- any fixed server may need **`connect_server({ server })`** (startup probe can set `auth_status: connect_required`).

Fixed scoped connect works even when **`allow_dynamic_connections: false`**.

### Resolver rules (HTTP)

```text
if connection_scope provided:
  resolve server in scope store (dynamic + fixed scoped entries)
else if fixed server has no auth_status (fixed direct):
  resolve fixed pool directly
else if fixed server auth_status is connect_required:
  error: call connect_server({ server: "<name>" }) first
else if server only exists in a scope:
  error: connection_scope required
```

On **stdio**, scoped tools may omit `connection_scope` when exactly one scope exists. Fixed direct unchanged.

### `list_servers` discovery

**Unscoped** (fixed config entries):

| Field | When present | Meaning |
|-------|--------------|---------|
| `auth_status` | Only `"connect_required"` | Agent must `connect_server({ server })` before scoped FGA tools |
| *(omit `auth_status`)* | Config `auth` or open FGA | Fixed direct — **`server` only** |

Do **not** expose `configured` vs `open` to clients — same agent action (omit `connection_scope`).

**Scoped** (`connection_scope` provided):

| Field | Values | Meaning |
|-------|--------|---------|
| `connected` | `true` / `false` | Whether this scope has a validated connection for that server |

When `connected: false`, call `connect_server({ server, connection_scope })` or complete pending elicitation and retry.

Top-level **`dynamic_connections_enabled`** reflects **`allow_dynamic_connections`**. Independent of fixed `connect_server({ server })`.

### When elicitation runs

| | Dynamic `connect_server({ api_url })` | Fixed scoped `connect_server({ server })` | Fixed direct |
|--|--------------------------------------|-------------------------------------------|--------------|
| **Trigger** | Agent connects with `api_url` | Agent connects with config server name | No connect |
| **Config gate** | `allow_dynamic_connections: true` | **None** when `auth_status: connect_required` | N/A |
| **First-time auth** | Probe at connect; elicit before returning scope | Same | Config `auth` or none |
| **Subsequent tools** | `connection_scope` + `server` | `connection_scope` + `server` | `server` only |

### Scope matrix (internal vs client)

| Connection type | Credential source | URL elicitation | `connection_scope` | Client `list_servers` |
|-----------------|-------------------|-----------------|---------------------|------------------------|
| Fixed — config `auth` | FGA config | Never | Not used | No `auth_status` |
| Fixed — open FGA | None | Never | Not used | No `auth_status` |
| Fixed — auth required (HTTP) | Elicitation → scope store | Yes at connect | Required on FGA tools | `auth_status: connect_required` |
| Dynamic | Elicitation at connect | Yes when `allow_dynamic_connections` | Required on FGA tools | N/A (use dynamic tier) |

---

## Config and auth shape

### FGA config

Each fixed server may include optional **`auth`** — discriminated union keyed by **`method`**. Omit `auth` when credentials should be elicited at runtime (or FGA requires none).

| Config | Behavior | When creds are obtained |
|--------|----------|-------------------------|
| No `auth` | HTTP: `auth_status: connect_required` if probe 401; stdio error if auth required | `connect_server` then scoped tools |
| `auth.method: "api_token"` | Pre-shared / configured | At startup (fixed direct) |
| `auth.method: "client_credentials"` | OIDC client credentials | At startup (fixed direct) |

**Implementation:** Nested `auth` in `fga-config.ts`. Top-level credential fields rejected with clear error.

Do not fail at startup when `auth` is omitted — probe at startup (or first `list_servers`) to set **`auth_status: connect_required`** when needed.

**Implementation note (not agent-facing):** probe distinguishes config `auth`, open FGA (`authn: none`), and 401 without config creds. Only the last case sets `connect_required`.

Legacy env bootstrap without secrets → single fixed server; same connect-required behavior when FGA requires auth.

Example:

```json
{
  "allow_dynamic_connections": false,
  "servers": {
    "local": { "api_url": "http://127.0.0.1:8080" },
    "prod-shared": {
      "api_url": "https://api.us1.fga.dev",
      "writeable": false,
      "restrict": true,
      "default_store": "01HABC..."
    },
    "prod-token": {
      "api_url": "https://api.us1.fga.dev",
      "auth": { "method": "api_token", "token": "..." }
    }
  }
}
```

### `allow_dynamic_connections`

Gates **`connect_server({ api_url })`** only (arbitrary runtime backends). **`connect_server({ server })`** for fixed scoped auth is **independent**.

Deprecated config alias: **`allow_runtime_connect`** accepted during migration.

### Server auth types

Used for fixed config, elicitation results, and scoped store profiles.

```typescript
type ApiTokenAuth = {
  method: "api_token";
  token: string;
};

type ClientCredentialsAuth = {
  method: "client_credentials";
  client_id: string;
  client_secret: string;
  issuer: string;
  audience?: string;
  scopes?: string;
};

type ServerAuth = ApiTokenAuth | ClientCredentialsAuth;
```

On a server profile: `auth?: ServerAuth`. Config JSON uses snake_case; maps to `@openfga/sdk` credentials in `server-pool.ts`.

| `auth.method` | Required | Optional |
|---------------|----------|----------|
| `api_token` | `token` | — |
| `client_credentials` | `client_id`, `client_secret`, `issuer` | `audience`, `scopes` |
| (omit `auth`) | — | Elicit when FGA requires credentials |

**Out of scope:** OAuth authorization code + PKCE. Elicitation supports pre-shared and OIDC **client credentials** only.

After hosted form submit, store same shape, e.g. `{ "method": "api_token", "token": "..." }` or client_credentials object. Form **Pre-shared** / **OIDC** maps to `api_token` vs `client_credentials`.

---

## Connect and elicitation flows

### Fixed scoped (HTTP)

```text
1. list_servers()
   → prod: { fixed: true, auth_status: "connect_required" }

2. connect_server({ server: "prod" })
   → Probe 401 → URLElicitationRequiredError + URL (reason: connect)

3. User completes hosted auth UI

4. Retry connect_server({ server: "prod" })
   → { connection_scope, server: "prod", connected: true }

5. list_stores({ connection_scope, server: "prod" }) → success
```

If agent calls `list_stores({ server: "prod" })` without scope:

```text
Server "prod" requires authentication. Call connect_server({ server: "prod" }) first,
then pass connection_scope on FGA tools.
```

### Dynamic (HTTP)

```text
1. connect_server({ api_url: "https://api.us1.fga.dev", requested_name: "prod" })

2. fga-mcp:
   - Creates pending elicitation (elicitationId, api_url, scope hints)
   - Probe → 401 → URLElicitationRequiredError / elicitation/create (mode: "url")
       url: "https://<fga-mcp-host>/auth/elicit/<uuid>"

3. User completes hosted auth UI

4. Retry connect_server({ api_url: "..." })

5. Returns { connection_scope, server, connected: true }

6. check_permission({ connection_scope, server, ... }) — no secrets
```

### No auth required

```text
connect_server({ api_url: "http://127.0.0.1:8080" })
  → probe succeeds (ListStores 200)
  → connect immediately, return connection_scope + server
```

Same for fixed scoped when probe unexpectedly succeeds without creds (open FGA misconfigured as connect_required until probe refreshes).

### User declines or expiry

Pending record discarded. Tool returns clear error; agent informs user connection was not established.

### Completion semantics

**Required: error + retry.** fga-mcp cannot block the tool request while the user fills a form.

| Phase | Who retries | Tool |
|-------|-------------|------|
| **Initial connect** (`reason: connect`) | Agent | **`connect_server`** (same args) |
| **Reauth** (`reason: reauth`) | Agent | **The FGA tool that got 401** (same args, including `connection_scope` + `server`) |

Steps:

1. Tool returns elicitation URL (`URLElicitationRequiredError` / `-32042` or structured JSON — see [Error surface](#error-surface-v1)).
2. MCP host opens URL; human completes browser form.
3. Agent retries per table above.
4. Server matches completed pending elicitation, attaches creds, succeeds (optional single internal retry on FGA call).

**Matching completed elicitation on retry:** Pending record keyed by **`elicitationId`**. On retry, server finds the **most recent completed** pending for the same intent:

- **Connect:** same `api_url` (dynamic) or same config `server` name (fixed scoped), and same minted or supplied `connection_scope` if extending a scope.
- **Reauth:** same `connection_scope` + `server`.

Do not match across unrelated scopes or server names.

**Optional (not a completion path):** `notifications/elicitation/complete` for host UX — fga-mcp must not depend on it.

### `connect_server` (target behavior)

Exactly one of **`api_url`** or **`server`**:

| Mode | Parameter | Config gate |
|------|-----------|-------------|
| **Dynamic** | `api_url` | `allow_dynamic_connections: true` |
| **Fixed scoped** | `server` | Fixed entry has `auth_status: connect_required` |

**Agent-visible parameters (non-secret):** `connection_scope?`, `requested_name?` (dynamic only), `default_store`, `default_model`, `restrict`, `writeable`, `label` (dynamic overrides; fixed scoped uses config profile unless overridden).

**Remove from tool schema:** `api_token`, `client_id`, `client_secret`, `issuer`, `audience`.

**Responses:**

| Outcome | Response |
|---------|----------|
| Connected | `{ connection_scope, server, connected: true, ... }` |
| Auth required | Elicitation error + URL (see [Error surface](#error-surface-v1)) |
| Declined / expired | Clear error for agent |

**Other tools:** No credential parameters. On FGA **401**, apply [Runtime auth errors (401)](#runtime-auth-errors-401).

**`disconnect_server`:** Removes scoped entries (fixed scoped and dynamic) from a scope; same rules as [multi-server spec](./multi-server-connections.md#disconnect_server-dynamic-tier).

### Error surface (v1)

Wire formats for [Path A and Path B](#elicitation-response-paths). Branch in `requestUrlElicitation()` — one code path, two response shapes.

#### Path A — `-32042` (`URLElicitationRequiredError`)

When `capabilities.elicitation.url` was declared at init:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32042,
    "message": "Authenticate to connect to OpenFGA",
    "data": {
      "elicitations": [
        {
          "mode": "url",
          "elicitationId": "<uuid>",
          "url": "https://<origin>/auth/elicit/<uuid>",
          "message": "Authenticate to connect to OpenFGA"
        }
      ]
    }
  }
}
```

Throw `@modelcontextprotocol/sdk` `UrlElicitationRequiredError` from tool handlers; the MCP protocol layer serializes this shape. fga-specific fields (`reason: connect | reauth`) are **not** in the MCP error payload — they are implied by which tool the agent retries.

#### Path B — `UserError` structured fallback

When `elicitation.url` was **not** declared at init:

```json
{
  "content": [{ "type": "text", "text": "Authenticate to connect to OpenFGA. Open the URL below, complete the form, then retry this tool with the same arguments." }],
  "isError": true,
  "structuredContent": {
    "elicitation_required": true,
    "elicitation_id": "<uuid>",
    "url": "https://<origin>/auth/elicit/<uuid>",
    "reason": "connect",
    "message": "Authenticate to connect to OpenFGA"
  }
}
```

**Never** use form-mode elicitation for secrets (MCP forbids API keys in form mode). **Never** send `elicitation/create` with `mode: "url"` when the client did not declare `elicitation.url`.

### Use cases

1. **Dynamic Auth0 FGA (HTTP)** — `connect_server({ api_url })`; elicit at connect.
2. **Shared fga-mcp, fixed `prod` without secrets (HTTP)** — per-user `connect_server({ server: "prod" })`; isolation via `connection_scope`.
3. **Local dev, open FGA** — fixed direct; no `auth_status`.
4. **Automation with config `auth`** — fixed direct; SDK refresh on 401.
5. **Enterprise HTTP** — fixed scoped and/or dynamic scopes per agent.

---

## Detecting auth requirement (probe)

Applies to **startup probe** (`auth_status` on fixed servers) and **`connect_server`** (both modes).

| Strategy | When |
|----------|------|
| **Probe** | Unauthenticated `ListStores` (minimal call) |
| **Known hosts** | Optional heuristics for Auth0 FGA URLs (skip probe) |

### Probe outcomes

| Result | Interpretation | fga-mcp action |
|--------|----------------|----------------|
| **200** | Open FGA (`authn: none`) | Fixed direct; connect without elicitation |
| **401** | Credentials required | URL elicitation (or `auth_status: connect_required` at startup) |
| **403** on unauthenticated probe | Proxy / misconfiguration | Fail with diagnostic — do not elicit |
| **Network / timeout** | Transient or unreachable | Do **not** set `connect_required`; omit `auth_status` or surface operator warning; retry probe on next `list_servers` |

Human selects **Pre-shared** vs **OIDC** on form — fga-mcp cannot infer from probe alone.

### Auth discovery limits

| Question | Detectable? |
|----------|-------------|
| Any credential required? | **Yes** — 200 vs 401 |
| Pre-shared vs OIDC? | **No** — user selects on form |
| Token expiry time? | **No** — discovered at 401 |

### OpenFGA server `authn` (layer 1 only)

Global for the OpenFGA process. **Out of scope:** OpenFGA experimental per-store API access control after authentication.

| Method | Behavior |
|--------|----------|
| **`none`** | All API calls succeed without credentials |
| **`preshared`** | Every call requires Bearer token |
| **`oidc`** | Every call requires valid JWT |

All-or-nothing at the API front door — no “unauthenticated reads, authenticated writes.”

**fga-mcp policy:** `writeable` and `restrict` are independent. Do not elicit for fga-mcp policy denials. Non-401 FGA errors → propagate; do not elicit.

---

## Hosted auth UI

URL elicitation requires **`--transport http`**. Auth routes on same FastMCP/Hono server as `/mcp`.

| Transport | Auth UI |
|-----------|---------|
| **HTTP** | `GET/POST /auth/elicit/{elicitationId}` on MCP origin |
| **stdio** | Not supported v1 — [stdio transport policy](#stdio-transport-policy-v1) |

### Form flow

1. **Method selection:** Pre-shared or OIDC (client credentials — not interactive login).
2. **Fields:**

**Pre-shared:** pre-shared key (required).

**OIDC:** issuer, client ID, client secret (required); audience, scopes (optional; prefill audience from `api_url` when possible).

Read-only context: target `api_url`. Page shows reason (`connect` vs `reauth`).

After POST: validate with `ListStores`; store creds in scope store; redirect to success page (“Return to your agent and retry the tool”). On 401 after submit: generic “credentials rejected.” Never echo secrets in URL query params.

### Implementation

| Piece | Approach |
|-------|----------|
| **Router** | `server.addRoute(..., { public: true })` before `server.start()` |
| **HTML** | Server-rendered templates in `src/auth/` — no client bundle |
| **POST** | `application/x-www-form-urlencoded` |
| **CSRF** | Token on `PendingElicitation`; hidden input; validate on POST |

```typescript
server.addRoute("GET", "/auth/elicit/:elicitationId", handleGetElicitForm, { public: true });
server.addRoute("POST", "/auth/elicit/:elicitationId", handlePostElicitForm, { public: true });
```

Register auth routes **only when `transport === "http"`**.

### Public URL for elicitation links

**Bind address ≠ browser URL.** Optional runtime setting (not FGA config):

| Setting | Example |
|---------|---------|
| `--public-url <origin>` | `https://fga-mcp.example.com` |
| `OPENFGA_MCP_PUBLIC_URL` | same |

**URL:** `{publicUrl}/auth/elicit/{elicitationId}`

**Fallback when unset:** if bind is `0.0.0.0` or `::` → `http://127.0.0.1:{port}`; else `http://{bindHost}:{port}`. Prefer `127.0.0.1` over `localhost`.

Do not derive from FGA `api_url`. Production: HTTPS at reverse proxy; set `public_url` to external origin.

---

## Server-side state

### Pending elicitation

```typescript
type PendingElicitation = {
  elicitationId: string;
  reason: "connect" | "reauth";
  connectMode: "api_url" | "server";
  apiUrl: string;
  connectionScope?: string;
  server?: string;
  requestedName?: string;
  fixedFromConfig?: boolean;
  csrfToken: string;
  policyHints?: { restrict?: boolean; writeable?: boolean; defaultStore?: string; defaultModel?: string };
  createdAt: number;
  expiresAt: number;
  status: "pending" | "completed" | "cancelled";
};
```

- TTL default: **15 minutes** (configurable).
- One-time use: completing or cancelling consumes the id.

### After completion

**Scoped entries:** Credentials merge into **`DynamicScopeStore`**. Fixed scoped copies `api_url`, policy, defaults from fixed config; `auth` from elicitation; **`fixed: true`**. Dynamic entries **`fixed: false`**.

**Fixed direct:** Config `auth` at startup — no scope store.

Pending elicitations and creds stay within the same **`connection_scope`** — do not share elicitation IDs across scopes.

---

## Runtime auth errors (401)

Classify by **credential source**. Only **401** triggers refresh or re-elicit.

| Source | On 401 |
|--------|--------|
| **Config `auth`** (fixed direct) | **Refresh from config** — SDK re-exchange; optional one internal retry; then error if still 401. **Do not elicit.** |
| **Scoped** (fixed scoped or dynamic) | **Re-elicit** (`reason: reauth`) — agent retries **same FGA tool** |
| **No creds yet** | Initial elicit at `connect_server` (HTTP); stdio → [elicitation unavailable](#stdio-transport-policy-v1) |

| `auth.method` | Typical 401 cause | Refresh |
|---------------|-------------------|---------|
| `client_credentials` | Expired access token | SDK token exchange from config |
| `api_token` | Revoked static key | Error — update config |

**Classifier:** `classifyOpenFgaAuthError(err, credSource)` → `refresh_config` | `re_elicit` | `other`. `credSource`: `config` | `scoped` | `none`.

**Re-elicit steps:** invalidate scoped client; create pending elicitation linked to scope + server; return URL; on completion rebuild client; optional one internal FGA retry.

---

## Transport

### HTTP (elicitation-capable)

Primary mode. Elicitation URL on same origin as `/mcp`. Set `public_url` behind reverse proxy or Docker.

| Transport | Config `auth` | Open FGA | Runtime elicitation |
|-----------|---------------|----------|---------------------|
| **HTTP** | Yes | Yes | Yes |
| **stdio** | Yes | Yes | **No** — actionable error |

### stdio transport policy (v1)

No HTTP server for `/auth/elicit/{id}`. **No** sidecar, external auth host, or in-process loopback listener in v1.

| Scenario | stdio behavior |
|----------|----------------|
| Fixed direct (config `auth` or open FGA) | Works |
| Fixed scoped / elicitation | Error — use HTTP or add config `auth` |
| `connect_server({ api_url })` without `allow_dynamic_connections` | Error |
| `connect_server({ server })` when no `auth_status` | Error — use fixed direct |

**Elicitation unavailable error (stdio):**

```text
OpenFGA server "<name>" requires authentication. Credential elicitation is not available on stdio transport.
Add an auth block to your FGA config for this server, or run fga-mcp with --transport http
(and set OPENFGA_MCP_PUBLIC_URL if the auth page is not at http://127.0.0.1:<port>).
```

**Optional later:** in-process loopback `/auth/*` in same process (not v1).

---

## Security

| Topic | Requirement |
|-------|-------------|
| Transport | HTTPS in production for auth UI and MCP |
| Elicitation TTL | Short-lived ids; reject expired |
| CSRF | Token on POST forms |
| Storage | In-memory per process; never logged; never in tool results |
| Scope isolation | Creds tied to `connection_scope` |
| Auth UI | Show target `api_url` |
| Rate limiting | Per-IP on `/auth/*` when HTTP exposed (recommended production) |

Do **not** use URL elicitation to authenticate users **to fga-mcp**.

---

## MCP URL elicitation integration

Research basis: MCP spec **2025-11-25** ([elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)), `@modelcontextprotocol/sdk` **v1.29.0** (installed), `fastmcp` **v4.3.0** (installed).

### What MCP provides

| Mechanism | When used | fga-mcp |
|-----------|-----------|---------|
| **`URLElicitationRequiredError` (`-32042`)** on failed `tools/call` | Tool cannot proceed until user completes OOB URL flow | **Primary** — `connect_server`, FGA tools on 401 reauth |
| **`elicitation/create` with `mode: "url"`** | Server-initiated, can block until user accepts | **Not used** — reactive error + agent retry is simpler and matches our connect/reauth model |
| **`notifications/elicitation/complete`** | Optional signal after OOB form POST | **Send on POST success** when client declared `elicitation.url`; flow does not depend on it |

Client capability at initialize (authoritative — do not guess):

```json
{
  "capabilities": {
    "elicitation": {
      "url": {}
    }
  }
}
```

Per spec: servers **MUST NOT** send URL elicitation to clients that did not declare `elicitation.url`. Empty `elicitation: {}` means form-only (legacy); treat as **no URL support**.

### SDK surface (concrete)

| API | Package path | Use in fga-mcp |
|-----|--------------|----------------|
| `UrlElicitationRequiredError` | `@modelcontextprotocol/sdk/types.js` | Throw from tools when Path A applies |
| `Server.getClientCapabilities()` | underlying MCP `Server` on each FastMCP session | Read `elicitation?.url` after init |
| `Server.createElicitationCompletionNotifier(elicitationId)` | same | Call after hosted form POST marks pending complete |
| `Server.elicitInput({ mode: 'url', ... })` | same | **Do not use** — proactive `elicitation/create` path |

Official reference implementation: `@modelcontextprotocol/sdk` examples `elicitationUrlExample` (server throws `UrlElicitationRequiredError`; POST handler calls completion notifier).

### FastMCP gap and dependency strategy

FastMCP **v4.3.0** (latest on npm) has no elicitation support. Open upstream tracking: [punkpeye/fastmcp#162](https://github.com/punkpeye/fastmcp/issues/162) (general elicitation; no issue yet for `-32042` passthrough specifically).

**The bug:** FastMCP's `CallTool` handler catches **all** thrown errors and converts them to `{ isError: true, content: [...] }` — including `UrlElicitationRequiredError`. The client never sees JSON-RPC **`-32042`** with `data.elicitations[]`.

The high-level SDK `McpServer` re-throws `UrlElicitationRequired` correctly (`server/mcp.js`); FastMCP uses low-level `Server.setRequestHandler(CallToolRequestSchema, ...)` in `src/FastMCP.ts` (~line 2203) and swallows it.

**The fix (4 lines)** — re-throw before the existing `UserError` branch:

```typescript
} catch (error) {
  if (error instanceof McpError && error.code === ErrorCode.UrlElicitationRequired) {
    throw error; // MCP protocol layer serializes as -32042
  }
  if (error instanceof UserError) {
    // existing Path B fallback — unchanged
```

**Local patch note:** committed patch uses duck-type `error.code === ErrorCode.UrlElicitationRequired` instead of `instanceof McpError` because duplicate SDK copies in the bundle can break `instanceof`. Upstream PR should prefer `instanceof` if FastMCP’s dependency graph guarantees a single SDK instance.

FastMCP already imports `McpError` and `ErrorCode` from `@modelcontextprotocol/sdk/types.js`. No new dependencies.

Without the local patch, Path A cannot reach the client (FastMCP converts `-32042` into a generic `isError` tool result). **Both paths are still required in v1** — the patch is step zero, not an optional extra for Path A only.

#### Why not a git-branch dependency?

The GitHub repo contains **`src/` only** — no committed `dist/`, and no `"prepare"` script to build on install. npm packages from the registry ship pre-built `dist/` (`"files": ["dist"]`). Pointing `package.json` at a fork branch would install source with `"main": "dist/FastMCP.js"` pointing at a file that does not exist until someone runs `tsup`.

A fork could work only with an added `"prepare": "npm run build"` hook (and devDeps installed on every `npm install`). That is heavier than a local patch for interim dev/demo.

#### Interim approach: local patch → verify → upstream PR

Use a **committed local patch** in fga-mcp while building and testing elicitation. After the full flow is verified end-to-end, open a PR to `punkpeye/fastmcp` with the **`src/FastMCP.ts`** change (not the generated `dist/chunk-*.js`). Remove the local patch when a fixed version ships on npm.

| Phase | Action |
|-------|--------|
| **1. Patch locally** | Apply passthrough in installed `node_modules/fastmcp/dist/chunk-QWUBNXAF.js` (v4.3.0 bundle); generate patch file — **required before elicitation work** |
| **2. Commit patch** | `patches/fastmcp+4.3.0.patch` + `patch-package` in `postinstall` |
| **3. Verify patch** | Test Path A: `UrlElicitationRequiredError` → JSON-RPC `-32042` on the wire. Test Path B on **unmodified** catch path: `UserError` → `structuredContent.url` |
| **4. Build fga-mcp elicitation** | Hosted auth, pending store, `requestUrlElicitation()` with [Path A / Path B branching](#elicitation-response-paths) |
| **5. Demo / E2E** | Both paths: capable client (`-32042`) and fallback client (`UserError`); full connect → POST → retry |
| **6. Upstream PR** | PR to `punkpeye/fastmcp`: fix `src/FastMCP.ts`, add vitest covering re-throw; reference #162 |
| **7. Drop patch** | When `fastmcp@X.Y.Z` with fix is on npm, remove `patches/` entry and bump dependency |

**Patch maintenance:** the patch targets generated `dist/chunk-*.js`; the chunk hash may change on FastMCP upgrades — re-apply or drop patch when bumping `fastmcp`. Document pinned version in README until upstream release.

**Upstream PR contents (after our verification):** the proven `src/FastMCP.ts` diff, a test that `CallTool` propagates `UrlElicitationRequiredError` as JSON-RPC `-32042`, and a note that `@modelcontextprotocol/sdk`'s `McpServer` already does this — FastMCP should match.

FastMCP **does** expose what we need on each session (no FastMCP API changes required beyond the re-throw):

- `FastMCPSession.server` — underlying MCP SDK `Server`; **`oninitialized`** callback fires after the client sends `notifications/initialized` (correct init-phase hook)
- `FastMCPSession.server.getClientCapabilities()` — client caps after init (preferred source; do **not** rely on `FastMCPSession.clientCapabilities`, which is copied later in FastMCP’s transport `ready` path)
- `FastMCPSession.sessionId` — key for pending elicitation binding
- `FastMCP` `connect` / `disconnect` events — attach init hooks and tear down registry entries

Tool `execute` context already includes `sessionId` (HTTP). It does **not** include the MCP `Server` reference; use a session registry populated during MCP init (see below).

### fga-mcp elicitation module

New package area: **`src/elicitation/`**

#### `session-registry.ts`

In-memory `Map<sessionId, { supportsUrlElicitation, mcpServer }>`. Register/unregister/get/clear only — no live-session refresh or polling.

#### `register-elicitation.ts`

On `FastMCP` `connect`, hook the underlying MCP SDK server (not FastMCP transport `ready`):

```typescript
server.on("connect", ({ session }) => {
  session.server.oninitialized = () => {
    registerElicitationSession(session.sessionId!, {
      clientCapabilities: session.server.getClientCapabilities() ?? null,
      mcpServer: session.server,
    });
  };
  // HTTP reconnect: client skips initialize when session id already exists
  if (session.server.getClientCapabilities()) registerFromInitialized(session);
});
server.on("disconnect", ({ session }) => unregisterElicitationSession(session.sessionId));
```

**Why not `connect` + `session.clientCapabilities`?** FastMCP emits `connect` before MCP init completes and copies caps into `session.clientCapabilities` only after its async transport `ready` path — too late for the first tool call after `client.connect()`. MCP init is synchronous request/response; `oninitialized` is the correct phase.

On `disconnect`: remove entry. Registry is in-memory per MCP session.

#### `request-url-elicitation.ts`

Single entry point called from `connect_server` and FGA tool 401 handler:

```typescript
function requestUrlElicitation(opts: {
  sessionId: string | undefined;
  transport: "http" | "stdio";
  elicitationId: string;
  url: string;
  message: string;
  reason: "connect" | "reauth";
}): never
```

Logic:

1. **stdio** → throw plain error ([stdio transport policy](#stdio-transport-policy-v1)); no URL emission.
2. Create/update `PendingElicitation` in store (CSRF, TTL, bind `sessionId`).
3. Look up session registry by `sessionId`.
4. If `supportsUrlElicitation` → `throw new UrlElicitationRequiredError([{ mode: "url", elicitationId, url, message }])`.
5. Else → `throw new UserError(message, { elicitation_required: true, elicitation_id, url, reason, message })` (Path B).

#### POST completion (implemented in `src/auth/routes.ts` + `notifyElicitationComplete`)

Plan named `complete-elicitation.ts`; **shipped without that file**. On successful `POST /auth/elicit/:id`:

1. `routes.ts` — validate CSRF, store creds in scope store, mark pending `completed`, render success HTML.
2. `notifyElicitationComplete()` in `request-url-elicitation.ts` — if session registry entry exists and `supportsUrlElicitation`:
   ```typescript
   session.mcpServer.createElicitationCompletionNotifier(elicitationId)().catch(() => {});
   ```

Completion notification is **optional UX** — agent retry remains the required completion path.

`registerElicitationSupport(server)` is called from `registerMcpCapabilities()` in `server.ts` (before `start()`).

### End-to-end flow (HTTP, capable client)

```text
1. Client initialize → capabilities.elicitation.url present
2. Client sends notifications/initialized → session.server.oninitialized → registry records supportsUrlElicitation: true

3. Agent: connect_server({ server: "prod" })
4. fga-mcp: probe → 401 → create PendingElicitation → requestUrlElicitation()
5. Tool throws UrlElicitationRequiredError → (patched) FastMCP re-throws → client gets -32042
6. Client opens URL with user consent

7. User POSTs credentials to /auth/elicit/{id}
8. fga-mcp: validate, store in DynamicScopeStore, optional elicitation/complete notification

9. Agent retries connect_server({ server: "prod" }) → matches completed pending → connected
```

Same sequence for **reauth** on FGA 401, except step 3 is the failing FGA tool and step 9 retries that tool.

### End-to-end flow (HTTP, no URL capability)

Steps 3–5: `UserError` → `CallToolResult` with `structuredContent.url`. Agent/host must surface URL to the user manually. Steps 7–9 unchanged.

---

## MCP client support

| Client capability at init | fga-mcp behavior |
|---------------------------|------------------|
| `elicitation.url` declared | Path A: `-32042` with `data.elicitations[]` |
| No `elicitation.url` (including `{}` form-only) | Path B: `UserError` structured fallback with `url` |
| stdio transport | No elicitation — config `auth`, open FGA, or actionable error |

Document tested clients in README after implementation (SDK example client, Cursor, etc.).

---

## Implementation plan

Single release — auth elicitation is one vertical feature; do not land probe/routes and MCP wiring in separate phases.

### Implementation status (2026-06-18)

**Shipped.** Remaining: upstream FastMCP PR, drop local patch after npm release, rate limiting on `/auth/*`, 401 reauth integration E2E (wired in code; not yet a dedicated docker test).

**Deviations from plan:**

| Area | Plan | As built |
|------|------|----------|
| Session registry timing | Register on FastMCP `connect` using `session.clientCapabilities` | Register on MCP SDK `session.server.oninitialized` (+ reconnect fallback reading `getClientCapabilities()`); see [register-elicitation.ts](../src/elicitation/register-elicitation.ts) |
| Completion helper | Separate `complete-elicitation.ts` | `auth/routes.ts` POST handler + `notifyElicitationComplete()` in `request-url-elicitation.ts` |
| FastMCP patch check | `instanceof McpError && error.code === UrlElicitationRequired` | `error.code === ErrorCode.UrlElicitationRequired` (duck-type; avoids duplicate `@modelcontextprotocol/sdk` copies breaking `instanceof`) |
| Path A/B verification | Standalone patch verification tests | Real MCP client E2E in `tests/integration/mcp/elicitation-e2e.test.ts` (same docker compose as other integration tests) plus handler smoke in `tests/integration/auth/connect-elicitation.test.ts` |
| CSRF | Unit test called out | Exercised in integration E2E via `completeAuthForm()`; no dedicated CSRF unit test |

### 1. FastMCP local patch (step zero — enables Path A; both paths ship in v1)

Prerequisite for [Path A](#elicitation-response-paths). [Path B](#elicitation-response-paths) uses stock FastMCP but is implemented and tested alongside Path A — not as a standalone release.

See [FastMCP gap and dependency strategy](#fastmcp-gap-and-dependency-strategy).

- [x] Apply passthrough in `node_modules/fastmcp/dist/chunk-QWUBNXAF.js` (v4.3.0) — duck-type `error.code === UrlElicitationRequired` (see deviations table)
- [x] Add `patch-package` devDep; `"postinstall": "patch-package"`; commit `patches/fastmcp+4.3.0.patch`
- [x] Verify **Path A:** MCP E2E — JSON-RPC `code: -32042`, `data.elicitations[]` (`tests/integration/mcp/elicitation-e2e.test.ts`)
- [x] Verify **Path B:** MCP E2E — `CallToolResult.isError` + `structuredContent.url` (no `-32042`)
- [x] Document in README: patched fastmcp until upstream release; both elicitation paths documented
- [ ] *(After both paths verified E2E)* Open PR to `punkpeye/fastmcp` with `src/FastMCP.ts` fix + test; comment on #162
- [ ] *(After upstream release)* Remove patch; bump `fastmcp` to fixed semver

### 2. Elicitation module (`src/elicitation/`)

- [x] `session-registry.ts` — in-memory map keyed by `sessionId`
- [x] `pending-store.ts` — `PendingElicitation` TTL, one-time use, CSRF, completion matching
- [x] `request-url-elicitation.ts` — capability branch (Path A vs B); includes `notifyElicitationComplete()`
- [x] POST completion — `auth/routes.ts` + `notifyElicitationComplete()` *(no separate `complete-elicitation.ts`)*
- [x] `register-elicitation.ts` — `oninitialized` hook + `connect`/`disconnect` *(not register-on-connect)*
- [x] `public-url.ts` — `OPENFGA_MCP_PUBLIC_URL` / `--public-url` URL builder

### 3. HTTP auth UI (`src/auth/`)

- [x] `routes.ts` — `GET/POST /auth/elicit/:elicitationId` via `server.addRoute(..., { public: true })`
- [x] `templates.ts` — server-rendered Pre-shared / OIDC form; bind `sessionId` in pending record
- [x] Register routes only when `transport === "http"`
- [ ] Rate limit `/auth/*` (recommended)

### 4. Probe and discovery

- [x] `auth-probe.ts` — unauthenticated `ListStores`; 200 / 401 / error policy per [Detecting auth requirement](#detecting-auth-requirement-probe)
- [x] Startup probe → `auth_status: connect_required` on fixed servers in `list_servers` (`client.ts` → `connectRequiredServers`)
- [x] Create `DynamicScopeStore` when dynamic **or** any fixed server may need scoped connect

### 5. Connect and routing

- [x] `connect_server({ server })` for fixed scoped — independent of `allow_dynamic_connections`
- [x] `connect_server` without cred params → probe → elicit or connect
- [x] Remove `api_token`, OIDC fields from connect tool schema
- [x] Scope store `fixed: true` for config-seeded scoped entries (`fixed_scoped` / `fixedFromConfig`)
- [x] Resolver: scoped vs fixed direct; connect-required errors
- [x] FGA config nested `auth`; reject flat cred fields
- [x] `buildCredentials()` from `ServerAuth`
- [x] `allow_dynamic_connections` rename + `dynamic_connections_enabled` in list

### 6. Runtime 401

- [x] `classifyOpenFgaAuthError()` → `refresh_config` | `re_elicit` | `other`
- [x] Fixed direct: SDK refresh from config; no elicitation
- [x] Scoped: invalidate client → `requestUrlElicitation({ reason: "reauth" })` → agent retries same FGA tool *(unit-tested classifier; no docker reauth E2E yet)*

### 7. Transport guards

- [x] Stdio: elicitation unavailable errors per [stdio transport policy](#stdio-transport-policy-v1)
- [x] HTTP: call `registerElicitationSupport(server)` in `registerMcpCapabilities()` (`server.ts`)

### 8. Tests and docs

- [x] Unit: probe outcomes, Path A and Path B branching, completion matching, stdio errors, auth classifier (`tests/unit/elicitation.test.ts`, `tests/unit/openfga-auth-error.test.ts`)
- [x] Integration: auth-enabled OpenFGA — **Path A E2E** and **Path B E2E** (real MCP client); connect → POST → retry; handler smoke tests
- [x] README: capability matrix, `public_url`, agent retry instructions, FastMCP patch note

---

## Design decisions (closed)

- **Fixed elicitation isolation** — `connection_scope` + scope store; connect-first via `connect_server({ server })`.
- **`allow_dynamic_connections`** — gates `connect_server({ api_url })` only; fixed scoped connect independent.
- **Client `auth_status`** — only `connect_required` when needed; scoped list uses `connected`.
- **stdio + auth UI** — HTTP required for elicitation v1.
- **Completion** — error + agent retry; connect retries `connect_server`, reauth retries failing FGA tool.
- **Elicitation paths (both required v1)** — [Path A](#elicitation-response-paths) (`-32042`) when client declared `elicitation.url`; [Path B](#elicitation-response-paths) (`UserError` + `structuredContent`) otherwise; single `requestUrlElicitation()` helper; never form-mode for secrets.
- **FastMCP local patch (interim)** — required for Path A; commit `patch-package` fix; upstream PR after both paths verified E2E; drop patch on npm release.
- **Session registry init hook** — MCP SDK `oninitialized` on `session.server`, not FastMCP transport `connect`/`ready` (see implementation status).
- **No PKCE, no layer-2 FGA access control, no sidecar auth host.**

---

## References

- MCP elicitation: https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation
- FastMCP elicitation (open): https://github.com/punkpeye/fastmcp/issues/162
- SEP-1036 URL mode: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1036
- OpenFGA configure auth: https://openfga.dev/docs/getting-started/setup-openfga/configure-openfga
- Code: `src/dynamic-scope-store.ts`, `src/tools/openfga.ts`, `src/fga-config.ts`
- Multi-server: [multi-server-connections.md](./multi-server-connections.md)
