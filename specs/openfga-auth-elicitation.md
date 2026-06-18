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

**Primary:** `URLElicitationRequiredError` (code **`-32042`**) with data:

```json
{
  "elicitation_required": true,
  "elicitation_id": "<uuid>",
  "url": "https://<origin>/auth/elicit/<uuid>",
  "reason": "connect",
  "message": "Authenticate to connect to OpenFGA"
}
```

**Fallback** when client does not surface `-32042`: same fields in tool error text / JSON body so agents can parse `url`.

Do not fall back to form-mode elicitation for secrets.

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

## MCP client support

URL elicitation in MCP **2025-11-25**. When unsupported, include `url` and human message in error JSON. Document tested clients in README when implemented.

---

## Implementation plan

### Release E1 — Foundation

- [ ] Pending elicitation store (TTL, one-time use, CSRF)
- [ ] OpenFGA auth probe helper (+ probe error / retry policy)
- [ ] Runtime `public_url` + elicitation URL builder
- [ ] HTTP auth routes (`src/auth/routes.ts`, `src/auth/templates.ts`) — HTTP only
- [ ] Stdio guard + elicitation unavailable errors
- [x] FGA config parser: nested `auth`; reject top-level credential fields
- [x] `buildCredentials()` from `ServerAuth`
- [ ] Create `DynamicScopeStore` when dynamic **or** fixed may need scoped connect
- [ ] Startup probe + `auth_status: connect_required` on `list_servers`
- [ ] `connect_server({ server })` for fixed scoped (independent of `allow_dynamic_connections`)
- [ ] Scope store `fixed: true` for config-seeded entries
- [ ] Resolver: scoped vs fixed direct; connect-required errors
- [ ] `connect_server` without cred params → probe → elicit or connect
- [x] Rename `allow_dynamic_connections`; deprecated `allow_runtime_connect`; `dynamic_connections_enabled` in list
- [ ] Remove credential params from connect tool schema
- [ ] Unit tests: probe, auth_status, fixed scoped, dynamic, stdio errors, completion matching

### Release E2 — MCP integration and runtime 401

- [ ] Error classifier (`401` → refresh vs re-elicit)
- [ ] Config refresh + scoped re-elicit in tool handlers
- [ ] Emit `-32042` / URL elicitation from FastMCP
- [ ] Optional `notifications/elicitation/complete`
- [ ] README + integration test (auth-enabled OpenFGA)

---

## Design decisions (closed)

- **Fixed elicitation isolation** — `connection_scope` + scope store; connect-first via `connect_server({ server })`.
- **`allow_dynamic_connections`** — gates `connect_server({ api_url })` only; fixed scoped connect independent.
- **Client `auth_status`** — only `connect_required` when needed; scoped list uses `connected`.
- **stdio + auth UI** — HTTP required for elicitation v1.
- **Completion** — error + agent retry; connect retries `connect_server`, reauth retries failing FGA tool.
- **No PKCE, no layer-2 FGA access control, no sidecar auth host.**

---

## References

- MCP elicitation: https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation
- SEP-1036 URL mode: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1036
- OpenFGA configure auth: https://openfga.dev/docs/getting-started/setup-openfga/configure-openfga
- Code: `src/dynamic-scope-store.ts`, `src/tools/openfga.ts`, `src/fga-config.ts`
- Multi-server: [multi-server-connections.md](./multi-server-connections.md)
