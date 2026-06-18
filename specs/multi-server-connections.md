# Multi-Server OpenFGA Connections

Status: **Implemented** — Releases A–D complete. Operator docs: [README](../README.md). Deferred v2 items tracked below.

## Summary

Extend fga-mcp so agents can work with **multiple named OpenFGA backends** (e.g. `dev`, `staging`, `prod`). Two tiers: **fixed** servers defined at startup (no `connection_scope`) and **dynamic** servers created at runtime via `connect_server` (scoped). The `server` parameter mirrors today's `store` pattern — default plus per-call override — applied one level up to FGA API connections.

Two dimensions when using **dynamic** connections:

| Parameter | Selects |
|-----------|---------|
| **`connection_scope`** | Which isolated session registry (application session) |
| **`server`** | Which named FGA backend within that registry |
| **`store`** | Which store on that backend (required on most admin tools) |
| **`model`** | Which authorization model version (optional — see [Store and model defaults](#store-and-model-defaults)) |

**Fixed servers** (startup config) use only `server` — no `connection_scope`. See [Fixed vs dynamic servers](#fixed-vs-dynamic-servers) below.

Example user intent:

> Check whether `user:anne` can `read` `document:1` on the **dev** server, in store `01HXYZ...`.

```text
// Fixed server (no scope)
check_permission({
  server: "dev",
  store: "01HXYZ...",
  ...
})

// Dynamic server (scope from connect_server)
check_permission({
  connection_scope: "550e8400-e29b-41d4-a716-446655440000",
  server: "staging",
  store: "01HXYZ...",
  ...
})
```

## Why `connection_scope`?

Multi-server support requires **server-side mutable state**: a registry of named `OpenFgaClient` instances, defaults, and connection metadata that persists across many tool calls within one agent workflow. Something must tell the server *which* registry to use when multiple MCP clients (or multiple agent threads) hit the same process.

### Stateless MCP

The MCP protocol is moving toward **stateless servers** — the server should not rely on implicit per-connection protocol state to interpret requests. [SEP-2567](https://modelcontextprotocol.io/seps/2567-sessionless-mcp) (sessionless MCP, targeted for MCP 2026-07) removes the assumption that the client and server share a long-lived session with server-held context between calls.

That direction fits how agents actually work: each tool call is largely self-contained from the protocol's perspective, and durable context belongs in **explicit parameters** the model can read, pass back, and reason about — not in hidden server memory keyed only by the transport.

### Why not `Mcp-Session-Id`?

The HTTP transport defines `Mcp-Session-Id`, but it is a poor fit for this use case and is **not viable long-term**:

- It is a **transport header**, not part of tool schemas — agents cannot set it per tool call, and it does not appear in tool results for the model to thread forward.
- It is **not available on stdio** (one process pair, no HTTP headers), so a session-id-based design would fork behavior by transport.
- It conflates **MCP wire session** (HTTP connection lifecycle) with **application session** (which FGA servers this agent configured). One user can open two MCP clients; one MCP session might reconnect; neither maps cleanly to "my dev + prod connections."
- SEP-2567 explicitly moves away from this model — building on `Mcp-Session-Id` would be aligning with something the spec is deprecating.

Auth identity (`userId`, OAuth subject) is also wrong as a scope key: the same authenticated user may run two independent agent sessions that must not share FGA connection registries.

### Explicit handle, unified transports

`connection_scope` is an **application-level session id** returned by the server (e.g. from `connect_server`) and passed back on subsequent tool calls — the same pattern MCP is adopting for other durable handles.

Using one mechanism for **stdio and HTTP**:

| Benefit | Detail |
|---------|--------|
| Same tool schemas | Agents learn one set of parameters; docs and examples do not fork. |
| Same server code | One `ConnectionScopeStore`; no parallel stdio-global vs HTTP-session implementations. |
| Real UUID everywhere | Even stdio returns a scope id from `connect_server` so responses match HTTP and agents can adopt one habit. |
| Transport-only leniency | Stdio allows omitting `connection_scope` when exactly one scope exists (one subprocess ≈ one agent). HTTP requires it because many clients share one process. |

Stdio does not need a scope parameter for correctness in the common case — process isolation already limits you to one agent — but **using the same handle model anyway** avoids a second code path and keeps agent prompts portable between local (stdio) and hosted (HTTP) deployments.

**Exception:** When the operator defines **fixed servers** at startup (see below), agents using only those servers never need `connection_scope` at all — the common production path for dev/prod pairs configured by infra.

## Fixed vs dynamic servers

Not all FGA backends need per-client session state. Operators often know the full set of backends at deploy time (`dev`, `prod`) and want every MCP client to reach them by name without a prior `connect_server` call.

Two tiers:

| Tier | When defined | Who shares it | `connection_scope` | Mutable at runtime |
|------|----------------|---------------|--------------------|--------------------|
| **Fixed direct** | Process startup (config/env) | All clients; config `auth` or open FGA | **Not used** | No (restart to change config) |
| **Fixed scoped** | Startup config + per-agent `connect_server({ server })` | One scope per agent workflow | **Required** (HTTP) after connect | Creds via scope store |
| **Dynamic** | Client via `connect_server({ api_url })` | One scope (isolated registry) | **Required** (HTTP) / returned on first connect (stdio) | Yes |

### Fixed servers (startup config)

- Loaded when the process starts; startup probe may set **`auth_status: connect_required`** on entries that need elicitation — see [auth elicitation](./openfga-auth-elicitation.md#list_servers-discovery).
- **Fixed direct** (no `auth_status`): admin tools with **no** `connection_scope` resolve `server` against the fixed pool.
- **Fixed scoped** (`auth_status: connect_required`, HTTP): agent calls **`connect_server({ server: "prod" })`** first — **not gated by `allow_dynamic_connections`**. Subsequent tools pass `connection_scope` + `server`.
- **`list_servers`** returns `dynamic_connections_enabled` and fixed servers (`fixed: true`). **`auth_status` appears only as `connect_required`** when connect is needed. Pass **`connection_scope`** to list scoped entries with **`connected`**.

### Dynamic servers (`connect_server({ api_url })`)

- Enabled when **`allow_dynamic_connections`** is `true` (**default: `false`** — opt-in for arbitrary runtime backends).
- First **`connect_server({ api_url })`** without `connection_scope` **mints** a scope UUID. Response includes assigned **`server`** name.
- Subsequent operations pass `connection_scope` + **`server`**.

### Resolution rules

```text
if connection_scope is provided:
  resolve server in scope store (dynamic entries + fixed scoped entries)
else if fixed server has no auth_status:
  resolve server in fixed registry
else if fixed server auth_status is connect_required:
  error — call connect_server({ server }) first
else:
  error if server not found
```

Fixed config and scope store are **separate namespaces** for server names — scoped fixed entries reuse config names (`fixed: true`). Dynamic assigned names remain `fixed: false`.

### Typical deployments

| Deployment | Fixed direct | Fixed scoped / Dynamic |
|------------|--------------|------------------------|
| Cursor stdio, dev + prod with config `auth` | `dev`, `prod` | Optional `allow_dynamic_connections` experiments |
| Hosted HTTP, locked-down | `dev`, `prod` with config `auth` | Disabled dynamic; fixed scoped if secret-free config |
| Hosted HTTP, multi-tenant | Shared read-only fixed direct | Per-agent scopes via fixed scoped connect and/or dynamic `api_url` |

## Implemented behavior

| Aspect | Behavior |
|--------|----------|
| FGA backends | **Fixed** pool at startup plus optional **dynamic** registries per `connection_scope` |
| Connection config | FGA config file (`--config` / `OPENFGA_MCP_CONFIG`), legacy env bootstrap, or `connect_server` |
| Store targeting | Optional `store` / `model` on relationship tools; per-server `default_store` / `default_model` |
| Writeable / restrict | **Independent** per-server policies (`writeable` gates mutations; `restrict` pins store/model) |
| Runtime URL change | Removed — HTTP `?config=` not supported; use FGA config or `connect_server` |
| Offline mode | No fixed servers and no `allow_dynamic_connections` → documentation/prompts only (fixed scoped connect still requires at least one fixed server in config) |
| Discovery | `list_servers` returns `dynamic_connections_enabled` + fixed servers; scoped call adds dynamic servers |

Relevant code: `src/client.ts`, `src/connection-resolver.ts`, `src/guards.ts`, `src/tools/openfga.ts`, `src/resource-resolver.ts`, `src/resources/admin.ts`.

## Goals

1. **Named server registry** — fixed pool at startup plus optional dynamic registries per scope.
2. **Connection scope** — for **scoped** servers (dynamic `api_url` and fixed auth elicitation); isolates per-agent credential and connection state on HTTP.
3. **Default server** — omit `server` on tool calls to use the configured default (fixed pool when unscoped).
4. **Connect / disconnect lifecycle** — **`connect_server`** for scoped servers (dynamic `api_url` or fixed `connect_required`); **`disconnect_server`** removes scoped entries; fixed direct servers are not disconnected at runtime.
5. **Startup configuration** — one config shape for stdio and HTTP; secrets in env or config file, not in chat.
6. **Unified transport** — same tool shapes and resolution logic; transport differs only in dynamic scope policy (stdio: one scope; HTTP: many).
7. **MCP-aligned state** — explicit `connection_scope` handle for scoped tier (SEP-2567 direction).

## Non-goals (initial version)

- Arbitrary OpenFGA CLI execution (`fga model test`, shell commands).
- Cross-server tuple migration or sync.
- Persisting scopes or registries to disk across process restarts.
- External scope store (Redis, etc.) — **in-memory only**, single process.
- Auth `userId` as scope key — sessions must be isolated even when the same user has two MCP clients.

---

## Design

### Concepts

| Term | Meaning |
|------|---------|
| **Fixed server** | Named FGA backend defined at process startup in config |
| **Fixed direct** | Fixed server with config `auth` or open FGA — no `connection_scope` |
| **Fixed scoped** | Fixed server with `auth_status: connect_required` — creds via `connect_server({ server })` into a scope |
| **Dynamic server** | Named FGA backend registered via `connect_server({ api_url })` within a scope |
| **Connection scope** | Application session id (UUID) for **scoped** registries. Not MCP `Mcp-Session-Id`; not auth `userId`. |
| **Server profile** | Named connection: API URL + auth credentials |
| **Server reference** | Short name (e.g. `dev`) within fixed or dynamic registry |
| **Default server** | Reference used when `server` is omitted (within the resolved pool) |
| **Default store / model** | Per-server pins in config; used when tool args omit `store` / `model` (see [Store and model defaults](#store-and-model-defaults)) |
| **Store ID** | OpenFGA store identifier **on a specific server** — not global across servers |
| **Model ID** | Authorization model version within a store; optional on tools |

**Important:** A server name (`dev`) and a store ID (`01HXYZ...`) are different dimensions. The same store ID string on two servers refers to **different** stores unless coincidentally identical.

### Store and model defaults

Relationship and tuple tools accept **optional** `store` and `model` when the resolved server has defaults configured. With multiple FGA servers, **default store and model belong at the server level** — each backend has its own store IDs and model versions. A single top-level pin only makes sense for legacy single-server setups.

#### Resolution order

After resolving **which server** (fixed pool, dynamic scope, or default server):

**`store`**

1. Per-call `store`
2. `servers[<resolved>].default_store`
3. Top-level `default_store` (legacy / single-server fallback)
4. Error — store required if still unset

**`model`**

1. Per-call `model`
2. `servers[<resolved>].default_model`
3. Top-level `default_model` (legacy / single-server fallback)
4. `"latest"` (OpenFGA API default)

```typescript
function resolveServerPolicy(
  config: AppConfig,
  serverRef: string,
): { defaultStore?: string; defaultModel?: string; restrict: boolean; writeable: boolean } {
  const global = config.defaults ?? {};
  const server = config.servers[serverRef] ?? {};
  return {
    defaultStore: server.default_store ?? global.default_store,
    defaultModel: server.default_model ?? global.default_model,
    restrict: server.restrict ?? global.restrict ?? false,
    writeable: server.writeable ?? global.writeable ?? false,
  };
}

function resolveStoreId(args: { store?: string }, policy: ReturnType<typeof resolveServerPolicy>): string {
  const store = args.store ?? policy.defaultStore;
  if (!store) throw storeRequired();
  return store;
}

function resolveModelId(args: { model?: string }, policy: ReturnType<typeof resolveServerPolicy>): string {
  return args.model ?? policy.defaultModel ?? "latest";
}
```

Pass resolved values to the SDK. Completions use the resolved server's store/model context.

#### When to pass `store` / `model` explicitly

- **Multi-store on one server** — agent calls `list_stores` and picks a non-default store.
- **Model migration** — pin an older `model` while a newer version exists.
- **Restrict** — when enabled, resolved store/model must match the server's pins; applies to reads **and** writes independently of `writeable`.
- **No server defaults configured** — agent must supply `store` (and optionally `model`).

For typical dev/prod configs with per-server pins, agents only pass `server` (or rely on `default_server`).

#### Implemented behavior (store/model)

| Surface | Behavior |
|---------|----------|
| Tools (`check_permission`, …) | `store` and `model` optional when server defaults exist |
| Resources | Config-dependent URI tiers; normalize → same resolver as tools; server/store defaults |
| Legacy env | `OPENFGA_MCP_API_STORE` / `_MODEL` map to top-level defaults for single-server bootstrap |
| Completions | Scoped to resolved server; restrict limits suggestions |

### Server pools (replaces single `ServerContext.client`)

One implementation for stdio and HTTP:

```typescript
type ServerRegistry = {
  servers: Map<string, OpenFgaClient>;
  defaultServer: string | null;
};

type FixedServerPool = ServerRegistry;  // loaded at startup, immutable

type DynamicScopeStore = {
  scopes: Map<string, ServerRegistry & { createdAt: number; lastUsedAt: number }>;
  transport: "stdio" | "http";
  allowDynamicConnections: boolean;
};

function resolveClient(
  fixed: FixedServerPool,
  dynamic: DynamicScopeStore,
  args: { connectionScope?: string; server?: string },
): OpenFgaClient {
  if (args.connectionScope) {
    const registry = dynamic.scopes.get(args.connectionScope);
    if (!registry) throw unknownScope(args.connectionScope);
    return resolveClientInRegistry(registry, args.server);
  }
  return resolveClientInRegistry(fixed, args.server);
}
```

**Storage:** in-process only. Fixed pool populated at startup. Dynamic scopes in `Map` with idle TTL on HTTP (see [Dynamic scope lifecycle](#dynamic-scope-lifecycle)).

### Dynamic scope lifecycle

Stdio and HTTP differ in how the server knows a client is gone:

| Transport | Cleanup trigger |
|-----------|-----------------|
| **Stdio** | **Process exit** — one subprocess per MCP client; drop all dynamic scopes and OpenFGA clients on shutdown. No idle TTL required (but may still apply as a safety net). |
| **HTTP** | **No reliable disconnect signal** — clients can stop calling without notice. Use **idle TTL** + explicit disconnect. |

**Scope lifetime rules (dynamic tier only):**

1. **Mint** — first `connect_server` without `connection_scope` creates a new scope UUID.
2. **Extend** — `connect_server` with existing `connection_scope` adds/updates servers in that scope.
3. **Last disconnect drops scope** — `disconnect_server` removing the **last** server in a scope **deletes the scope** and closes all OpenFGA clients in it. A subsequent `connect_server` without `connection_scope` mints a **new** scope UUID. No separate `close_connection` tool.
4. **Idle TTL (HTTP)** — evict scopes with no tool activity for `dynamic.scope_idle_ttl_seconds` (touch `lastUsedAt` on any dynamic-tier tool call). After eviction, `connection_scope` is unknown; client must connect again.
5. **Stdio cap** — at most **one** active dynamic scope per process (transport policy); process exit clears it.

Per-scope server limits and global scope limits are **resource bounds**, not abuse prevention — a caller can mint many scopes on HTTP. Limits reduce leak damage from a single session; global caps + TTL protect the process. Real abuse mitigation belongs at the HTTP edge (auth, rate limits).

### Transport policy (dynamic scopes only)

Fixed servers ignore this table — no scope ever.

| | **Stdio** | **HTTP** |
|---|-----------|----------|
| Max active dynamic scopes | **1** (hard) | **`dynamic.max_scopes`** (default 100; `null` = unlimited) |
| Scope cleanup | Process exit + last disconnect | Idle TTL + last disconnect |
| `connection_scope` on admin tools | **Optional** when using dynamic tier and exactly one scope exists | **Required** when using dynamic tier |
| Scope id format | Real **UUID** | Real **UUID** |
| Lazy scope create | On first `connect_server` | On first `connect_server` |

Omitting `connection_scope` on admin tools targets **fixed direct** when the server has **no** `auth_status`. Scoped servers require explicit scope on HTTP (stdio single-scope leniency unchanged).

### When `connection_scope` is minted

1. **`connect_server`** without `connection_scope` — mint scope (dynamic `api_url` or fixed scoped `server`).
2. **`connect_server`** with `connection_scope` — add/update server in that scope.
3. **Not** minted for fixed direct tool calls.

Do **not** mint on documentation/prompt tools.

**Gates:**

| Connect call | Requires |
|--------------|----------|
| `connect_server({ api_url })` | `allow_dynamic_connections: true` |
| `connect_server({ server })` | Fixed entry with `auth_status: connect_required` (HTTP elicitation) |

### `disconnect_server` (dynamic tier)

Removes one server from a dynamic scope. Requires `connection_scope` and `server` (the **assigned** name).

| Case | Behavior |
|------|----------|
| Server exists, other servers remain | Remove server and close its OpenFGA client; scope survives |
| Server exists, **last** server in scope | Remove server **and drop the entire scope** |
| Unknown scope or server | Error (see [Error messages](#error-messages)) |

After the scope is dropped (last disconnect or TTL eviction), the client must call `connect_server` without `connection_scope` to obtain a new scope id.

### Server profile shape

Optional **`auth`** object on each server — a discriminated union (`method` selects pre-shared vs OIDC). Omit `auth` when credentials should come from URL elicitation on **HTTP transport** (or the FGA server is open). On **stdio**, auth-protected servers need `auth` in config — elicitation is not available. See [OpenFGA auth elicitation](./openfga-auth-elicitation.md#stdio-transport-policy-v1).

```typescript
type ServerProfile = {
  name: string;
  apiUrl: string;
  auth?: ApiTokenAuth | ClientCredentialsAuth;
  label?: string;
  defaultStore?: string;
  defaultModel?: string;
  restrict?: boolean;
  writeable?: boolean;
};

type ApiTokenAuth = {
  method: "api_token";
  token: string;
};

type ClientCredentialsAuth = {
  method: "client_credentials";
  clientId: string;
  clientSecret: string;
  issuer: string;
  audience?: string;
  scopes?: string;   // optional, space-separated
};
```

JSON config uses snake_case inside `auth` (`token`, `client_id`, `client_secret`, …). Validation: `method` is required; fields must match the variant. Validate configured servers on load with `listStores({ pageSize: 1 })`.

Stored dynamic entries use the same profile shape as fixed servers; `name` is the **assigned** key from `connect_server`, not the caller's `requested_name` when they differ.

### Configuration

Two **separate** startup concerns — intentionally **not** in the same file:

| Concern | Source | What it controls |
|---------|--------|------------------|
| **FGA connections** | `--config <path>` (JSON file) | Fixed `servers`, defaults, restrict, writeable, `allow_dynamic_connections` |
| **MCP process runtime** | CLI flags and/or env | stdio vs HTTP, bind host/port, SSE, stateless, debug |

**Why split?**

- **Different lifecycles** — FGA config (which backends, store pins, credentials) is shared across deployments; transport (port, bind address) is per-environment.
- **Same file, many launch modes** — one `fga-mcp.json` works for Cursor stdio (`fga-mcp --config …`) and hosted HTTP (`fga-mcp --config … --transport http --port 9090`) without editing the file.
- **Stdio is implicit** — MCP subprocesses are always stdio; a `transport` block in the FGA config file would be noise or wrong.
- **Ops convention** — binding and listen ports belong in args/env (12-factor); connection profiles belong in a config artifact.

There is little benefit to merging them except "one mount point" in Docker — and that is outweighed by duplicating transport settings across environments that share FGA config.

Runtime settings use CLI flags with env fallback (`OPENFGA_MCP_TRANSPORT`, …); see `src/runtime-config.ts` and `src/index.ts`.

#### FGA config file (`--config`)

```json
{
  "default_server": "dev",
  "allow_dynamic_connections": false,
  "dynamic": {
    "scope_idle_ttl_seconds": 86400,
    "max_servers_per_scope": 10,
    "max_scopes": 100
  },
  "defaults": {
    "writeable": false,
    "restrict": false
  },
  "servers": {
    "dev": {
      "api_url": "http://127.0.0.1:8080",
      "default_store": "01HDEV...",
      "default_model": "01HDEVMODEL...",
      "writeable": true
    },
    "prod": {
      "api_url": "https://api.us1.fga.dev",
      "auth": {
        "method": "client_credentials",
        "issuer": "https://auth.fga.dev",
        "client_id": "...",
        "client_secret": "...",
        "audience": "https://api.us1.fga.dev/"
      },
      "default_store": "01HPROD...",
      "default_model": "01HPRODMODEL...",
      "restrict": true,
      "writeable": false
    }
  }
}
```

| Field | Purpose |
|-------|---------|
| `default_server` | Default FGA `server` when omitted on tool calls |
| `allow_dynamic_connections` | Enable dynamic tier (`connect_server`); **default `false`** |
| `dynamic.*` | Limits and TTL for dynamic scopes (ignored when `allow_dynamic_connections` is false) |
| `defaults.*` | Global writeable/restrict/store/model defaults |
| `servers.*` | Fixed FGA server profiles (see earlier tables) |

**`dynamic` object** (all optional; defaults shown above):

| Field | Default | `null` | Purpose |
|-------|---------|--------|---------|
| `scope_idle_ttl_seconds` | `86400` (24h) | No idle eviction | HTTP only; stdio relies primarily on process exit |
| `max_servers_per_scope` | `10` | Unlimited | Leak guard per scope — not anti-abuse |
| `max_scopes` | `100` | Unlimited | Process-wide cap on dynamic scopes (HTTP); stdio hard-limited to 1 |

Omit a field → use default. Set to **`null`** → disable that limit/TTL. Operators tuning local dev may set `max_scopes: null` and `max_servers_per_scope: null`; production HTTP should keep sensible caps and TTL.

Top-level **`defaults`** apply to all fixed servers unless a server entry overrides. **`default_store` and `default_model` belong on each server** in multi-server setups; top-level copies exist for legacy single-server bootstrap only.

**Legacy flat env mapping** (FGA fallback when no config file):

| Env var | Config equivalent |
|---------|-------------------|
| `OPENFGA_MCP_API_WRITEABLE` | `defaults.writeable` |
| `OPENFGA_MCP_API_RESTRICT` | `defaults.restrict` |
| `OPENFGA_MCP_API_STORE` | `defaults.default_store` |
| `OPENFGA_MCP_API_MODEL` | `defaults.default_model` |
| `OPENFGA_MCP_API_URL` (+ auth) | single `servers.default` bootstrap |

Dynamic profiles from `connect_server` may carry optional `default_store`, `default_model`, `restrict`, and `writeable` for that scope entry.

#### CLI and env (process runtime)

Transport and debug are **not** in the FGA config file. Set via CLI (preferred) or env (fallback):

```bash
# Stdio + FGA config (typical MCP client / local)
fga-mcp --config /path/to/fga-mcp.json

# HTTP + same FGA config
fga-mcp --config /path/to/fga-mcp.json --transport http --host 0.0.0.0 --port 9090

# Legacy: no FGA config file, flat env only
OPENFGA_MCP_API_URL=http://127.0.0.1:8080 fga-mcp
```

**Runtime CLI flags:**

| Flag | Default | Purpose |
|------|---------|---------|
| `--config <path>` | — | Load FGA config file |
| `--transport stdio\|http` | `stdio` | MCP transport mode |
| `--host <addr>` | `127.0.0.1` | HTTP bind host |
| `--port <n>` | `9090` | HTTP port |
| `--sse` / `--no-sse` | `true` | HTTP SSE |
| `--stateless` / `--no-stateless` | `false` | HTTP stateless mode |
| `--public-url <origin>` | — | Browser-reachable origin for auth elicitation URLs ([auth elicitation spec](./openfga-auth-elicitation.md#public-url-for-elicitation-links)) |
| `--debug` / `--no-debug` | `true` | Debug logging |

**Runtime env vars** (same settings; used when CLI flags are not passed):

| Env var | Maps to |
|---------|---------|
| `OPENFGA_MCP_TRANSPORT` | `--transport` |
| `OPENFGA_MCP_TRANSPORT_HOST` | `--host` |
| `OPENFGA_MCP_TRANSPORT_PORT` | `--port` |
| `OPENFGA_MCP_TRANSPORT_SSE` | `--sse` |
| `OPENFGA_MCP_TRANSPORT_STATELESS` | `--stateless` |
| `OPENFGA_MCP_PUBLIC_URL` | `--public-url` |
| `OPENFGA_MCP_DEBUG` | `--debug` |

#### Precedence

Two independent chains:

**FGA connections:** built-in defaults → `--config` file → legacy FGA env vars (`OPENFGA_MCP_API_URL`, …)

**Process runtime:** built-in defaults → runtime env vars → **runtime CLI flags** (highest)

`OPENFGA_MCP_CONFIG=/path` env var is a fallback way to specify the FGA config file path when `--config` cannot be passed — not the primary pattern.

#### Stdio MCP client config

```json
{
  "mcpServers": {
    "OpenFGA": {
      "command": "npx",
      "args": ["fga-mcp", "--config", "/absolute/path/to/fga-mcp.json"]
    }
  }
}
```

No transport args needed — stdio is the default. The FGA config file is the same one used for HTTP deployments.

Legacy single-server without a config file:

```json
{
  "mcpServers": {
    "OpenFGA": {
      "command": "npx",
      "args": ["fga-mcp"],
      "env": { "OPENFGA_MCP_API_URL": "http://127.0.0.1:8080" }
    }
  }
}
```

#### HTTP / Docker / k8s

```bash
fga-mcp --config /etc/fga-mcp/fga-mcp.json --transport http --host 0.0.0.0 --port 9090

docker run -v ./fga-mcp.json:/etc/fga-mcp/fga-mcp.json fga-mcp \
  --config /etc/fga-mcp/fga-mcp.json --transport http --host 0.0.0.0 --port 9090
```

Env fallback when the entrypoint cannot receive args:

```bash
docker run -v ./fga-mcp.json:/etc/fga-mcp/fga-mcp.json \
  -e OPENFGA_MCP_CONFIG=/etc/fga-mcp/fga-mcp.json \
  -e OPENFGA_MCP_TRANSPORT=http \
  -e OPENFGA_MCP_TRANSPORT_PORT=9090 \
  fga-mcp
```

Secrets: v1 uses env vars or literals in the FGA config file. In-file `token_env`-style indirection is **pending** — see [§4](#4-config-delivery-and-secret-indirection).

#### Backward compatibility

If no FGA config file and no structured `servers` block, treat legacy `OPENFGA_MCP_API_URL` (+ auth env vars) as a single fixed server named `default`. Transport continues to work via env until CLI is implemented.

#### Dynamic connections (formerly “runtime connect”)

`connect_server({ api_url })` registers into a scope only when **`allow_dynamic_connections: true`**. Distinct from **`connect_server({ server })`** for fixed auth elicitation — see [auth elicitation spec](./openfga-auth-elicitation.md#connect_server-target-behavior).

Deprecated config alias: **`allow_runtime_connect`** accepted as synonym for **`allow_dynamic_connections`** during migration.

See [`connect_server`](#connect_server-dynamic-tier) below for input/output and **server name assignment** rules.

### New MCP tools

| Tool | Purpose |
|------|---------|
| `connect_server` | Mint or extend a scope. **`api_url`** (dynamic, requires `allow_dynamic_connections`) or **`server`** (fixed scoped auth). Returns `connection_scope` and `server` |
| `disconnect_server` | Remove a scoped server; **drop scope when last server removed** |
| `list_servers` | `dynamic_connections_enabled` + fixed entries with `auth_status`. With `connection_scope`: scoped servers too |
| `set_default_server` | Set default within fixed direct pool (no scope) or within a scope |

### `connect_server`

The caller supplies either **`api_url`** (dynamic) or **`server`** (fixed scoped auth) — mutually exclusive. Dynamic mode assigns the registry key; fixed scoped mode uses the config server name. Agents must use returned `connection_scope` and `server` on scoped FGA tools.

#### Input

```typescript
type ConnectServerInput = {
  connection_scope?: string;   // omit on first connect → mint new scope
  api_url?: string;            // dynamic mode — requires allow_dynamic_connections
  server?: string;             // fixed scoped mode — config name when auth_status connect_required
  requested_name?: string;     // dynamic mode only — optional hint
  label?: string;
  default_store?: string;
  default_model?: string;
  restrict?: boolean;
  writeable?: boolean;
};
```

#### Dynamic tier (api_url)

Names are unique **within a dynamic scope** (fixed and dynamic registries remain separate namespaces).

| Situation | Assigned `server` |
|-----------|-------------------|
| `requested_name` free in scope | Use `requested_name` as-is |
| `requested_name` taken in scope (different `api_url`) | Append suffix: `dev` → `dev-1`, `dev-2`, … |
| `requested_name` omitted | Derive from `api_url` host (sanitized, e.g. `staging`, `local-8080`); suffix if taken |
| Same scope + same `api_url` already connected | **Upsert:** return existing assigned name (update credentials/profile); `renamed: false` |

**Authoritative rule:** the `server` field in the response is the only name to use on later calls. Do not assume it equals `requested_name`.

Auto-generated names must be **human-readable** (host-derived or monotonic `server-1`, `server-2` within the scope) — not random UUIDs. UUIDs are reserved for `connection_scope`.

**First server in a new scope** becomes the scope's default server. Additional connects do not change the default unless `set_default_server` is called.

#### Fixed scoped tier (server)

When **`list_servers`** reports **`auth_status: connect_required`** for a fixed entry:

- Call **`connect_server({ server: "prod" })`** — allowed even when **`allow_dynamic_connections: false`**.
- Profile (`api_url`, `writeable`, `restrict`, defaults) copied from fixed config; **`auth`** from elicitation (see auth spec).
- Response **`server`** is the config name (no renaming). Entry stored with **`fixed: true`** in scope.
- On HTTP, all subsequent FGA tools require **`connection_scope` + `server`**.

#### Output

```json
{
  "connection_scope": "550e8400-e29b-41d4-a716-446655440000",
  "server": "dev-1",
  "requested_name": "dev",
  "renamed": true,
  "connected": true,
  "api_url": "http://127.0.0.1:8080"
}
```

| Field | Meaning |
|-------|---------|
| `connection_scope` | Scope UUID — pass on subsequent dynamic-tier calls |
| `server` | **Assigned** registry key — pass as `server` on subsequent calls |
| `requested_name` | Echo of input hint, if provided; omitted when caller did not send one |
| `renamed` | `true` when assigned name differs from `requested_name` (collision, auto-generate, or suffix) |
| `connected` | Connection validated (`listStores({ pageSize: 1 })`) |
| `api_url` | Connected backend URL |

Example — name free:

```json
{
  "connection_scope": "550e8400-e29b-41d4-a716-446655440000",
  "server": "staging",
  "requested_name": "staging",
  "renamed": false,
  "connected": true,
  "api_url": "http://staging:8080"
}
```

Example — no name requested (host-derived):

```json
{
  "connection_scope": "550e8400-e29b-41d4-a716-446655440000",
  "server": "api-us1-fga-dev",
  "renamed": false,
  "connected": true,
  "api_url": "https://api.us1.fga.dev"
}
```

Validation (per profile): OAuth requires all four fields; token wins over OAuth if both set. Validate on connect with `listStores({ pageSize: 1 })`. Dynamic profiles inherit top-level `defaults` unless overridden on the connect call.

**`list_servers` — fixed (no scope):**

```json
{
  "dynamic_connections_enabled": true,
  "servers": [
    {
      "name": "dev",
      "api_url": "http://127.0.0.1:8080",
      "default": true,
      "fixed": true
    },
    {
      "name": "prod",
      "api_url": "https://api.us1.fga.dev",
      "auth_status": "connect_required",
      "default": false,
      "fixed": true
    }
  ]
}
```

**`list_servers` — with scope (fixed scoped + dynamic):**

```json
{
  "dynamic_connections_enabled": true,
  "connection_scope": "550e8400-e29b-41d4-a716-446655440000",
  "servers": [
    {
      "name": "prod",
      "api_url": "https://api.us1.fga.dev",
      "connected": true,
      "default": true,
      "fixed": true
    },
    {
      "name": "staging",
      "api_url": "http://staging:8080",
      "connected": true,
      "default": false,
      "fixed": false
    }
  ]
}
```

### Changes to existing tools

Add to all **online** admin **tools**:

```typescript
connection_scope?: string;  // omit for fixed servers; required for dynamic on HTTP
server?: string;            // optional; defaults within the resolved pool
store?: string;             // optional when server has default_store configured
model?: string;             // optional; server default_model, then "latest"
```

Affected tools: `check_permission`, `grant_permission`, `revoke_permission`, `list_objects`, `list_users`. Store-only tools (`list_models`, `create_model`, …) keep current `store` requirements; `model` only where it selects a version for evaluation or validation.

**Resource templates** use the same resolution semantics but encode pool routing in the **URI path** (see [Resource URIs](#resource-uris-release-d)) rather than separate MCP tool arguments. Tuple/check parameters (`user`, `relation`, `object`, `model`) remain query segments on templates that already use them.

`verify_model` validates DSL locally — may ignore `connection_scope`, `server`, and `model`.

Documentation and prompt tools remain **server-agnostic** (offline-capable).

### Resource URIs (Release D)

MCP does not require one global URI scheme. This server **registers different OpenFGA admin resource template sets at startup** based on loaded FGA config. Clients discover only what that process advertises in `resources/list`.

**Documentation resources** (`openfga://docs/...`) are unchanged in all modes — local index, no `server` or `connection_scope`.

#### URI tiers

| Deployment | Templates registered | Example |
|------------|---------------------|---------|
| Single fixed server, no runtime connect | **Legacy** — `server` implicit | `openfga://store/{storeId}/model/{modelId}` |
| Multiple fixed servers | **Server-prefixed** | `openfga://server/{server}/store/{storeId}/model/{modelId}` |
| Fixed + dynamic (`allow_dynamic_connections`) | **Two families** — fixed reads without scope; dynamic reads with scope | Fixed: `openfga://server/{server}/store/...` · Dynamic: `openfga://scope/{connectionScope}/server/{server}/store/...` |

Registration rules:

- Register **legacy** URIs only when exactly **one** fixed server exists and `allow_dynamic_connections` is false. Omitted `server` in the path resolves that sole backend.
- Do **not** register legacy `openfga://store/{storeId}/...` when multiple fixed servers are configured — the backend is ambiguous.
- When both fixed and dynamic tiers are enabled, register **both** template families. Omitting `scope` in the URI always targets the **fixed** pool (mirrors tool resolution).
- Check/expand-style templates keep query parameters for tuple fields as today; path segments identify pool, server, and store.

**Stdio dynamic leniency:** when exactly one dynamic scope exists, the `scope` path segment may be optional on dynamic-tier templates (same policy as tools). **HTTP** requires `scope` in the URI for dynamic-tier reads.

Examples (multi-fixed):

```text
openfga://server/dev/stores
openfga://server/prod/store/{storeId}/check?user=...&relation=...&object=...&model=...
```

Examples (dynamic tier, HTTP):

```text
openfga://scope/{connectionScope}/server/staging/store/{storeId}/relationships
```

#### Resolution (shared with tools)

Registration varies by config; **resolution is one code path**. Each resource `load` callback normalizes extracted path/query params, then calls the same pool logic as admin tools:

```typescript
type ResourceTargetInput = {
  connection_scope?: string;
  server?: string;
  store?: string;   // from {storeId} path segment or policy default
  model?: string;
};
```

```text
URI template (legacy | server-prefixed | scope-prefixed)
  → normalizeResourceTarget(params)
  → resolveResourceTarget(ctx, input)   // same rules as resolveAdminTarget()
  → existing read handler
```

No separate handler implementation per URI tier — only separate template registrations whose `load` wrappers funnel through the normalizer.

Implemented in `src/resource-resolver.ts` and `src/resources/admin.ts`.

### Completions

Resolve pool first (fixed if no scope, dynamic if scope), then `server`, then complete store/model/relation/etc. on that backend only. Tool and prompt completions use this scoping. Resource template `complete` callbacks receive only the partial value (FastMCP API) — full cross-argument scoping on resource templates is best-effort via default server.

### Writeable policy

Controls **mutations only** — whether tuple, store, and model write tools may run against the resolved server.

| | |
|---|---|
| **Question** | May this server be modified? |
| **Applies to** | `grant_permission`, `revoke_permission`, `create_store`, `delete_store`, `create_model`, etc. |
| **Default** | `false` (safe by default) |
| **Inheritance** | `defaults.writeable` → `servers.<name>.writeable` override |
| **Independent of** | `restrict` — writes are gated solely by `writeable` after store/model resolve |

When `writeable` is false, read/query tools still work (subject to `restrict`).

### Restrict policy

Controls **which store and model** may be targeted on the resolved server. Does **not** imply read-only.

| | |
|---|---|
| **Question** | Which store/model IDs are allowed on this server? |
| **Applies to** | All online admin tools (reads and writes) once store/model are resolved |
| **Default** | `false` (any store/model on that FGA backend) |
| **When true** | Enforces **only configured pins** — see below. `restrict: true` with no `default_store` or `default_model` is a **config error** at startup. |
| **Independent of** | `writeable` — restrict validates scope; writeable gates mutations separately |

When `restrict` is false, `default_store` / `default_model` are convenience defaults only (used when tool args omit them), not an allowlist.

#### What restrict enforces

Restrict applies **per dimension**, only where a default is configured on that server:

| Config | When `restrict: true` |
|--------|------------------------|
| `default_store` only | Resolved store must match; **any** model on that store allowed (explicit or `"latest"`) |
| `default_store` + `default_model` | Both resolved values must match |
| `default_model` only | **Invalid** — model IDs are store-scoped; config validation rejects this |

`restrict: true` with neither pin configured is invalid — there is nothing to restrict to.

Legacy single-server `OPENFGA_MCP_API_RESTRICT=true` already requires both store and model env vars; bootstrap maps both pins plus `restrict: true`.

### Combined behavior

All four combinations are valid:

| restrict | writeable | Typical use |
|----------|-----------|-------------|
| off | off | Explore/read any store on server; no mutations |
| on | off | Store pinned (and model too if configured); checks only |
| on | on | Store pinned (and model too if configured); writes allowed within that scope |
| off | on | Full read/write on that server (e.g. local dev) |

Example config: `dev` with `restrict: false`, `writeable: true` — open dev backend with writes. `prod` with `restrict: true`, `writeable: false` — prod checks against pinned store/model only, no mutations.

### Guard evaluation

Policies are evaluated **independently** after resolving `server`, `store`, and `model`:

```typescript
function guardAdminTool(
  policy: ServerPolicy,
  resolved: { store: string; model: string },
  isWrite: boolean,
): string | null {
  if (policy.restrict) {
    if (policy.defaultStore && resolved.store !== policy.defaultStore) {
      return restrictedStoreError(policy.defaultStore);
    }
    if (policy.defaultModel && resolved.model !== policy.defaultModel) {
      return restrictedModelError(policy.defaultModel);
    }
  }
  if (isWrite && !policy.writeable) {
    return writeDisabledError();
  }
  return null;
}
```

**Migration (implemented):** `checkRestrictedModeForWrites()` removed — restrict does not block writes on its own. Legacy `OPENFGA_MCP_API_RESTRICT=true` maps to `restrict: true` with `writeable: false` for read-only prod; see README.

### HTTP transport

HTTP clients pass `connection_scope` on tool arguments for the dynamic tier (required on HTTP). Configuration is loaded at process startup via `--config` / env — not per-request query parameters.

**Do not use** auth `userId` as the scope key — two sessions for the same user must not share FGA connections.

Future HTTP work uses the same `ConnectionScopeStore` as stdio. Request handling resolves `connection_scope` from tool arguments only (not headers). Aligns with MCP 2026-07 stateless / explicit-handle direction (SEP-2567).

### Security

- Never log tokens or client secrets.
- `connection_scope` values must be unguessable UUIDs.
- Enforce `dynamic.max_servers_per_scope` and `dynamic.max_scopes` when configured (non-`null`).
- Evict idle scopes via `dynamic.scope_idle_ttl_seconds` on HTTP when configured (non-`null`).
- Per-scope limits bound resource leaks per session; global scope limits bound process memory. Neither prevents abuse across many minted scopes — use HTTP auth and rate limits at the edge.
- Prefer env bootstrap over runtime connect in production (`allow_dynamic_connections: false`).
- `list_servers` returns URLs and names only.

### Error messages

```
❌ Unknown server "staging". Fixed servers: dev, prod. Use list_servers or connect_server for dynamic connections.
❌ connection_scope is required for dynamic servers on HTTP. Call connect_server first.
❌ Unknown connection_scope "…". Call connect_server to create a dynamic session (scope may have expired or been dropped after last disconnect).
❌ Runtime connect is disabled. Use fixed servers: dev, prod.
❌ connect_server requires api_url.
❌ Maximum servers per connection scope (10) reached. Disconnect unused servers or set dynamic.max_servers_per_scope in config.
❌ Maximum connection scopes (100) reached. Disconnect unused scopes or set dynamic.max_scopes in config.
❌ No default server configured. Pass server explicitly or set default_server in config.
❌ Restricted: store must be 01HPROD... on server "prod".
❌ Restricted: model must be 01HPRODMODEL... on server "prod".
❌ Write operations are disabled on server "prod". Set writeable: true to enable.
```

---

## Implementation plan

Track rollout here at **release** granularity. Update checkboxes when a release merges to `main`. Detailed task breakdown lives in PRs; this section answers "what's done" and "what's next."

**Status:** Releases A–D complete

| Release | Theme | Status |
|---------|-------|--------|
| A | Foundation — CLI, FGA config, fixed multi-server | ✅ Done |
| B | Agent ergonomics — defaults, optional store/model, policy | ✅ Done |
| C | Dynamic tier — `connection_scope`, runtime connect | ✅ Done |
| D | Polish — completions, resources, deprecations, docs | ✅ Done |

Status markers: ⬜ Not started · 🔄 In progress · ✅ Done

### Release A — Foundation

Shippable alone. No `connection_scope`. Backward compatible with legacy env single-server setups.

- [x] CLI arg parser: `--config`, `--transport`, `--host`, `--port`, `--sse`, `--stateless`, `--debug`
- [x] Runtime config precedence: defaults → env → CLI flags
- [x] FGA config file loader (`--config` path; `OPENFGA_MCP_CONFIG` env fallback)
- [x] Legacy env bootstrap → single fixed server named `default`
- [x] `FixedServerPool` — map of named `OpenFgaClient` instances at startup
- [x] `resolveClient(fixed, server?)` — replace single `ctx.client` in handlers
- [x] Optional `server` param on admin tools (resources/completions: Release D)
- [x] `list_servers` tool (fixed pool only; no scope)
- [x] Unit tests: config loader, pool, resolve, legacy bootstrap
- [x] Integration test: two FGA backends via fixed config

### Release B — Agent ergonomics & policy

Builds on A. Improves tool ergonomics; **behavior change** for restrict/writeable decoupling.

- [x] `resolveServerPolicy()` — per-server defaults + inherited restrict/writeable
- [x] `resolveStoreId()` / `resolveModelId()` — optional store/model on relationship tools
- [x] Per-server `default_store` / `default_model` in FGA config
- [x] Decouple restrict from writeable (remove restrict-implied write block)
- [x] Config validation: `restrict: true` requires at least one pin; reject model-only pin
- [x] `set_default_server` tool (fixed pool)
- [x] Unit tests: policy inheritance, restrict × writeable matrix, store/model resolution
- [x] README: FGA config file, `--config`, optional store/model

### Release C — Dynamic tier

Defer until HTTP multi-tenant or runtime connect is needed. Internal types should anticipate this (from A) but tools stay hidden until C.

- [x] `DynamicScopeStore` — scoped registries with UUID minting, idle TTL, configurable caps
- [x] `connect_server`, `disconnect_server` tools
- [x] `connect_server` input: optional `requested_name`; output: assigned `server`, `requested_name` echo, `renamed` flag
- [x] Server name assignment: suffix on collision (`dev-1`), host-derived fallback when omitted, upsert by `api_url` within scope
- [x] `disconnect_server`: last server in scope drops scope; next connect mints new scope
- [x] FGA config `dynamic.*`: `scope_idle_ttl_seconds`, `max_servers_per_scope`, `max_scopes` (defaults + `null` to disable)
- [x] `list_servers` with `connection_scope` (includes dynamic servers; always returns `dynamic_connections_enabled` + fixed)
- [x] `list_servers` returns `dynamic_connections_enabled` for connect_server discovery
- [x] Optional `connection_scope` on admin tools
- [x] HTTP: scope required for dynamic tier; idle TTL eviction
- [x] Stdio: at most one dynamic scope; scope optional when sole scope exists; cleanup on process exit
- [x] `allow_dynamic_connections` config gate (default `false`; accepts deprecated `allow_runtime_connect`)
- [x] Unit + integration tests: scope minting, TTL, last-disconnect drop, caps, name assignment, upsert, isolation

### Release D — Polish

- [x] Completions scoped to resolved server/store (and scope when dynamic)
- [x] `normalizeResourceTarget()` + `resolveResourceTarget()` — shared with `resolveAdminTarget()`
- [x] Config-conditional resource registration:
  - [x] Legacy URIs when single fixed server, no runtime connect
  - [x] Server-prefixed URIs when multiple fixed servers
  - [x] Scope-prefixed URIs for dynamic-tier reads when `allow_dynamic_connections`
  - [x] Both fixed and scope-prefixed families when fixed + dynamic coexist
- [x] Resource read handlers via resolved target (not default client only)
- [x] Unit tests: URI normalization, registration matrix per config, resolution parity with tools
- [x] Remove HTTP `?config=` middleware (removed with Release D cleanup)
- [x] README: resource URI tiers, `connection_scope` threading for HTTP clients
- [x] README: migration from legacy env, config delivery, production HTTP notes
- [x] MCP server instructions + tool/param descriptions for routing and discovery
- [x] Integration tests: dynamic tier and resource resolution against live OpenFGA
- [x] Migration notes: legacy restrict → `restrict` + `writeable: false` (see README)

### Deferred (not in v1)

- [ ] Per-store alias maps
- [ ] Secret `token_env` indirection in FGA config
- [ ] External scope store (Redis) / multi-worker HTTP

### Internal groundwork (Release A — complete)

- [x] `resolveClient()` accepts `{ connectionScope?, server? }`
- [x] Handler context carries `FixedServerPool` and `DynamicScopeStore`
- [x] Policy resolver shape matches spec
- [x] Resource handlers accept resolved target shape; registration + normalizer per URI tier

---

## Migration from single-client model (complete)

Rollout followed [Implementation plan](#implementation-plan) Releases A–D. End state:

1. `FixedServerPool` + optional `DynamicScopeStore` and unified `resolveClient()` ✅
2. FGA config via `--config` / `OPENFGA_MCP_CONFIG`; runtime via CLI/env ✅
3. Optional `connection_scope`, `server`, `store`, `model` on admin tools ✅
4. Connect/disconnect/list/set-default tools ✅
5. Decoupled restrict and writeable guards ✅
6. HTTP `?config=` removed ✅
7. Config-conditional resource URI tiers with shared normalization/resolver ✅

Operator migration notes: [README](../README.md) (legacy env mapping, restrict + writeable).

---

## Open issues / decisions

Each item has an explicit status: **Decided** (spec is closed), **Deferred** (out of v1 scope), or **Pending** (v2 — not yet implemented).

### 1. Store aliases

**Deferred (not v1).** No alias map in config; agents use `list_stores` for discovery. Revisit if alias ergonomics become a priority.

### 2. Policy on dynamic servers

**Decided:** Dynamic profiles from `connect_server` inherit top-level `defaults` unless overridden on the connect call or stored profile. `restrict` and `writeable` are independent on dynamic entries, same as fixed servers.

### 3. Legacy restrict = read-only

**Decided:** Legacy env bootstrap maps `OPENFGA_MCP_API_RESTRICT=true` → `defaults.restrict: true`. Writes are gated by `writeable` only (default `false`). That preserves the old effective read-only behavior without re-coupling restrict to writes. Operators who want writes on a restricted server must set `OPENFGA_MCP_API_WRITEABLE=true` (or `writeable: true` in FGA config) explicitly.

### 4. Config delivery and secret indirection

**Decided (config delivery):** FGA config file via `--config <path>`. Fallback: `OPENFGA_MCP_CONFIG` env var as a **file path** or **inline JSON** when CLI args are unavailable (implemented).

**Pending (secret indirection):** Syntax for secret references in FGA config JSON (e.g. `token_env: "OPENFGA_MCP_API_TOKEN"`) is **not decided**. v1 uses literal secrets in the config file `auth` object or env vars for legacy bootstrap. Define `token_env` shape before implementing in-file secret indirection (tracked under [Deferred](#deferred-not-in-v1)).

### 5. Legacy profile name

**Decided:** Legacy single-server env bootstrap names the sole fixed server **`default`** and sets `default_server: "default"`. If `OPENFGA_MCP_DEFAULT_SERVER` is set, use that name instead (for operators who want a custom key without a config file).

### 6. `verify_model`

**Decided:** Ignore `connection_scope`, `server`, and `model` — validates DSL locally only; no OpenFGA backend required.

### 7. Per-store default model map

**Deferred (not v1).** One `default_store` + `default_model` per server suffices. No mapping of multiple stores per server (e.g. store aliases → models).

### 8. Disconnect entire scope

**Decided:** no separate `close_connection` tool. **`disconnect_server` dropping the last server in a scope deletes the scope.** Next `connect_server` without `connection_scope` mints a new scope UUID.

### 9. `connect_server` naming

**Decided:** optional `requested_name` on input; **assigned** `server` on output (authoritative for later calls). Collision within scope → suffix (`dev-1`). Omitted name → host-derived or monotonic fallback. Same `api_url` in scope → upsert and return existing assigned name.

### 10. Resource URIs

**Decided:** no single global URI form. **Register different OpenFGA admin template sets at startup** based on config:

- **Single fixed server** — legacy URIs (`openfga://store/{storeId}/...`); server implicit.
- **Multiple fixed servers** — server-prefixed URIs (`openfga://server/{server}/store/...`).
- **Dynamic tier** — scope-prefixed URIs for dynamic reads (`openfga://scope/{connectionScope}/server/{server}/store/...`); fixed reads stay scope-free when both tiers coexist.

**One resolver** normalizes path/query params from any registered template into `{ connection_scope?, server?, store?, model? }` and uses the same pool logic as tools (`resolveAdminTarget` / `resolveClient`). Separate template registrations per tier; shared read handlers. Documentation resources unchanged. Do not register legacy store-only URIs when multiple fixed servers are configured.

### 11. Scope TTL and connection limits

**Decided:**

- **Idle TTL:** `dynamic.scope_idle_ttl_seconds`, default **86400** (24h). HTTP evicts scopes idle longer than TTL. **`null`** disables idle eviction (not recommended for HTTP). Stdio relies primarily on process exit.
- **Per-scope server cap:** `dynamic.max_servers_per_scope`, default **10**. **`null`** = unlimited. Leak guard only — not anti-abuse.
- **Global scope cap:** `dynamic.max_scopes`, default **100** on HTTP. **`null`** = unlimited. Stdio hard-limited to **1** scope regardless of config.
- All limits configurable in the FGA config file; omit field for default, **`null`** to disable.

### 12. Published npm / MCP instructions

**Done.** README covers operator setup; MCP `instructions` and tool/param descriptions cover discovery (`list_servers`, `dynamic_connections_enabled`, `auth_status`), routing (`connection_scope`, `server`), resource URI tiers, and policy (`writeable`, `restrict`).

---

## References

- Current startup: `src/index.ts`, `src/config.ts`, `src/server.ts`
- Store/restrict guards: `src/guards.ts`
- Tool parameters: `src/tools/openfga.ts`
- MCP explicit handles: [SEP-2567](https://modelcontextprotocol.io/seps/2567-sessionless-mcp)
