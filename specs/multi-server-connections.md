# Multi-Server OpenFGA Connections

Status: **Draft** — not implemented

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
| **Fixed** | Process startup (config/env) | All clients on this process | **Not used** | No (restart to change) |
| **Dynamic** | Client via `connect_server` | One scope (isolated registry) | **Required** (HTTP) / returned on first connect (stdio) | Yes |

### Fixed servers (startup config)

- Loaded when the process starts; clients connect to the MCP server and immediately use `server: "dev"` / `server: "prod"`.
- **`list_servers`** with **no** `connection_scope` lists fixed servers only.
- Admin tools with **no** `connection_scope` resolve `server` against the fixed registry.
- If only fixed servers exist, agents never receive or thread a scope id — simplest ergonomics for the common case.

### Dynamic servers (runtime connect)

- Enabled when `allow_runtime_connect` is true (default TBD; likely `false` in production).
- First **`connect_server`** without `connection_scope` **mints** a scope UUID and registers the server in that scope's registry.
- Subsequent operations pass `connection_scope` + `server` for servers in that scope.
- **`list_servers`** **with** `connection_scope` lists dynamic servers in that scope only (not fixed servers — use unscoped `list_servers` for those).

### Resolution rules

```text
if connection_scope is provided:
  resolve server in dynamic registry for that scope
else:
  resolve server in fixed registry
  (error if server not found and runtime connect disabled)
```

Fixed and dynamic registries are **separate namespaces**. The same reference name (e.g. `dev`) may exist in both without collision — `connection_scope` selects which pool. Prefer distinct names in dynamic scopes to avoid agent confusion.

### Typical deployments

| Deployment | Fixed | Dynamic |
|------------|-------|---------|
| Cursor stdio, dev + prod in env | `dev`, `prod` | Optional local experiments |
| Hosted HTTP, locked-down | `dev`, `prod` from secrets | Disabled |
| Hosted HTTP, multi-tenant experiments | None or shared read-only | Per-agent scopes via `connect_server` |

## Current behavior (baseline)

| Aspect | Today |
|--------|--------|
| FGA backends | **One** `OpenFgaClient`, created at process startup in `createServerContext()` |
| Connection config | `OPENFGA_MCP_API_URL` + token or OAuth env vars |
| Store targeting | Per-tool `store` / `model`; target optional with per-server defaults |
| Store/model default | Not applied today. Target: per-server `default_store` / `default_model` in config |
| Writeable / restrict | Global env flags today; **restrict also blocks writes** (coupled). Target: **independent** per-server policies |
| Runtime URL change | HTTP `?config=` updates `process.env` but **does not** recreate the client — ineffective for switching backends |
| Offline mode | No URL, token, or client ID → documentation/prompts only |

Relevant code today: `src/client.ts`, `src/configurable-http.ts`, `src/guards.ts`, `src/tools/openfga.ts`.

## Goals

1. **Named server registry** — fixed pool at startup plus optional dynamic registries per scope.
2. **Connection scope** — only for **dynamic** servers; isolates runtime-created connections between concurrent HTTP clients.
3. **Default server** — omit `server` on tool calls to use the configured default (fixed pool when unscoped).
4. **Connect / disconnect lifecycle** — MCP tools for **dynamic** servers only; fixed servers are not disconnected at runtime.
5. **Startup configuration** — one config shape for stdio and HTTP; secrets in env or config file, not in chat.
6. **Unified transport** — same tool shapes and resolution logic; transport differs only in dynamic scope policy (stdio: one scope; HTTP: many).
7. **MCP-aligned state** — explicit handles for dynamic tier only (SEP-2567 direction).

## Non-goals (initial version)

- Arbitrary OpenFGA CLI execution (`fga model test`, shell commands).
- Cross-server tuple migration or sync.
- Persisting scopes or registries to disk across process restarts.
- External scope store (Redis, etc.) — **in-memory only**, single process.
- HTTP `?config=` query-param configuration (deprecated; see below).
- Auth `userId` as scope key — sessions must be isolated even when the same user has two MCP clients.

---

## Design

### Concepts

| Term | Meaning |
|------|---------|
| **Fixed server** | Named FGA backend defined at process startup; shared by all clients; no `connection_scope` |
| **Dynamic server** | Named FGA backend registered at runtime via `connect_server` within a scope |
| **Connection scope** | Application session id (UUID) for **dynamic** registries only. Not MCP `Mcp-Session-Id`; not auth `userId`. |
| **Server profile** | Named connection: API URL + auth credentials |
| **Server reference** | Short name (e.g. `dev`) within fixed or dynamic registry |
| **Default server** | Reference used when `server` is omitted (within the resolved pool) |
| **Default store / model** | Per-server pins in config; used when tool args omit `store` / `model` (see [Store and model defaults](#store-and-model-defaults)) |
| **Store ID** | OpenFGA store identifier **on a specific server** — not global across servers |
| **Model ID** | Authorization model version within a store; optional on tools |

**Important:** A server name (`dev`) and a store ID (`01HXYZ...`) are different dimensions. The same store ID string on two servers refers to **different** stores unless coincidentally identical.

### Store and model defaults

Today, relationship tools require both `store` and `model` on every call. With multiple FGA servers, **default store and model belong at the server level** — each backend has its own store IDs and model versions. A single top-level pin only makes sense for legacy single-server setups.

**Change:** `store` and `model` are **optional** on relationship and tuple tools when the resolved server has defaults configured (or after the agent has picked a store once and the operator pinned it). Omit both for the common path: `server: "dev"` + tuple args only.

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

#### Current vs target behavior

| Surface | Today | Target |
|---------|-------|--------|
| Tools (`check_permission`, …) | `store` and `model` required | both optional when server defaults exist |
| Resources | `model` defaults to `"latest"` | also use server-level store/model defaults |
| Legacy env | `OPENFGA_MCP_API_STORE` / `_MODEL` | map to top-level defaults for single-server bootstrap |
| Completions | store from env in restrict mode | scoped to resolved server; restrict limits suggestions |

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
  allowRuntimeConnect: boolean;
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

**Storage:** in-process only. Fixed pool populated at startup. Dynamic scopes in `Map` with TTL on HTTP.

### Transport policy (dynamic scopes only)

Fixed servers ignore this table — no scope ever.

| | **Stdio** | **HTTP** |
|---|-----------|----------|
| Max active dynamic scopes | **1** | Many (TTL eviction) |
| `connection_scope` on admin tools | **Optional** when using dynamic tier and exactly one scope exists | **Required** when using dynamic tier |
| Scope id format | Real **UUID** | Real **UUID** |
| Lazy scope create | On first `connect_server` | On first `connect_server` |

Omitting `connection_scope` on admin tools always targets the **fixed** pool. Dynamic tier is opt-in via explicit scope (or stdio single-scope leniency after first `connect_server`).

### When `connection_scope` is minted

Only for the **dynamic** tier:

1. **`connect_server`** without `connection_scope` — mint scope, register server, return `connection_scope`.
2. **`connect_server`** with `connection_scope` — add/update server in that scope.
3. **Not** minted for fixed servers or when `allow_runtime_connect` is false.

Do **not** mint on documentation/prompt tools or on fixed-server tool calls.

**Scope TTL (HTTP):** evict idle dynamic scopes after configurable duration (e.g. 24h).

### Server profile shape

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
  audience: string;
};
```

Validation (per profile): OAuth requires all four fields; token wins over OAuth if both set. Validate on connect with `listStores({ pageSize: 1 })`.

### Configuration

Two **separate** startup concerns — intentionally **not** in the same file:

| Concern | Source | What it controls |
|---------|--------|------------------|
| **FGA connections** | `--config <path>` (JSON file) | Fixed `servers`, defaults, restrict, writeable, `allow_runtime_connect` |
| **MCP process runtime** | CLI flags and/or env | stdio vs HTTP, bind host/port, SSE, stateless, debug |

**Why split?**

- **Different lifecycles** — FGA config (which backends, store pins, credentials) is shared across deployments; transport (port, bind address) is per-environment.
- **Same file, many launch modes** — one `fga-mcp.json` works for Cursor stdio (`fga-mcp --config …`) and hosted HTTP (`fga-mcp --config … --transport http --port 9090`) without editing the file.
- **Stdio is implicit** — MCP subprocesses are always stdio; a `transport` block in the FGA config file would be noise or wrong.
- **Ops convention** — binding and listen ports belong in args/env (12-factor); connection profiles belong in a config artifact.

There is little benefit to merging them except "one mount point" in Docker — and that is outweighed by duplicating transport settings across environments that share FGA config.

Today only **env vars** exist for runtime settings (`OPENFGA_MCP_TRANSPORT`, …) and there is **no CLI parser** in `src/index.ts` — the spec below is the **target**.

#### FGA config file (`--config`)

```json
{
  "default_server": "dev",
  "allow_runtime_connect": false,
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
      "client_id": "...",
      "client_secret": "...",
      "issuer": "...",
      "audience": "...",
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
| `allow_runtime_connect` | Enable dynamic tier (`connect_server`) |
| `defaults.*` | Global writeable/restrict/store/model defaults |
| `servers.*` | Fixed FGA server profiles (see earlier tables) |

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
| `--debug` / `--no-debug` | `true` | Debug logging |

**Runtime env vars** (same settings; used when CLI flags are not passed):

| Env var | Maps to |
|---------|---------|
| `OPENFGA_MCP_TRANSPORT` | `--transport` |
| `OPENFGA_MCP_TRANSPORT_HOST` | `--host` |
| `OPENFGA_MCP_TRANSPORT_PORT` | `--port` |
| `OPENFGA_MCP_TRANSPORT_SSE` | `--sse` |
| `OPENFGA_MCP_TRANSPORT_STATELESS` | `--stateless` |
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

Secrets: prefer env vars or `token_env`-style indirection in the FGA config file — exact syntax TBD.

#### Backward compatibility

If no FGA config file and no structured `servers` block, treat legacy `OPENFGA_MCP_API_URL` (+ auth env vars) as a single fixed server named `default`. Transport continues to work via env until CLI is implemented.

#### Runtime connect (dynamic tier)

`connect_server` registers into a dynamic scope only. Gated by `allow_runtime_connect` in the FGA config file.

### New MCP tools

| Tool | Purpose |
|------|---------|
| `connect_server` | **Dynamic only.** Mint or extend a scope; connect a named profile; return `connection_scope` |
| `disconnect_server` | **Dynamic only.** Remove a server from a scope (or drop scope if last server) |
| `list_servers` | Without `connection_scope`: list **fixed** servers. With scope: list **dynamic** servers in that scope |
| `set_default_server` | Set default within fixed pool (no scope) or dynamic pool (with scope) |

**`list_servers` — fixed (no scope):**

```json
{
  "servers": [
    { "name": "dev", "api_url": "http://127.0.0.1:8080", "default": true, "fixed": true },
    { "name": "prod", "api_url": "https://api.us1.fga.dev", "default": false, "fixed": true }
  ]
}
```

**`connect_server` response (dynamic):**

```json
{
  "connection_scope": "550e8400-e29b-41d4-a716-446655440000",
  "server": "dev",
  "connected": true,
  "api_url": "http://127.0.0.1:8080"
}
```

**`list_servers` — dynamic (with scope):**

```json
{
  "connection_scope": "550e8400-e29b-41d4-a716-446655440000",
  "servers": [
    { "name": "staging", "api_url": "http://staging:8080", "default": true, "fixed": false }
  ]
}
```

### Changes to existing tools

Add to all **online** admin tools and resource templates:

```typescript
connection_scope?: string;  // omit for fixed servers; required for dynamic on HTTP
server?: string;            // optional; defaults within the resolved pool
store?: string;             // optional when server has default_store configured
model?: string;             // optional; server default_model, then "latest"
```

Affected tools: `check_permission`, `grant_permission`, `revoke_permission`, `list_objects`, `list_users`, and matching resource templates. Store-only tools (`list_models`, `create_model`, …) keep current `store` requirements; `model` only where it selects a version for evaluation or validation.

`verify_model` validates DSL locally — may ignore `connection_scope`, `server`, and `model`.

Documentation and prompt tools remain **server-agnostic** (offline-capable).

### Completions

Resolve pool first (fixed if no scope, dynamic if scope), then `server`, then complete store/model/relation/etc. on that backend only.

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

**Migration from today:** remove `checkRestrictedModeForWrites()` — restrict must not block writes on its own. Legacy `OPENFGA_MCP_API_RESTRICT=true` maps to `restrict: true` with `writeable: false` only if operators relied on read-only prod; document that enabling writes under restrict requires explicit `writeable: true`.

### HTTP transport and deprecated patterns

**Do not use** HTTP `?config=` query parameters for multi-server or session state:

- Not MCP-spec discoverable; agent cannot set it per tool call.
- Mutates global `process.env`; does not recreate clients today.
- Wrong isolation model vs. explicit `connection_scope`.

**Do not use** auth `userId` as the scope key — two sessions for the same user must not share FGA connections.

Future HTTP work uses the same `ConnectionScopeStore` as stdio. Request handling resolves `connection_scope` from tool arguments only (not headers). Aligns with MCP 2026-07 stateless / explicit-handle direction (SEP-2567).

### Security

- Never log tokens or client secrets.
- `connection_scope` values must be unguessable UUIDs.
- Cap servers per scope and scopes in memory (HTTP).
- Prefer env bootstrap over runtime connect in production.
- `list_servers` returns URLs and names only.

### Error messages

```
❌ Unknown server "staging". Fixed servers: dev, prod. Use list_servers or connect_server for dynamic connections.
❌ connection_scope is required for dynamic servers on HTTP. Call connect_server first.
❌ Unknown connection_scope "…". Call connect_server to create a dynamic session.
❌ Runtime connect is disabled. Use fixed servers: dev, prod.
❌ No default server configured. Pass server explicitly or set default_server in config.
❌ Restricted: store must be 01HPROD... on server "prod".
❌ Restricted: model must be 01HPRODMODEL... on server "prod".
❌ Write operations are disabled on server "prod". Set writeable: true to enable.
```

---

## Implementation plan

Track rollout here at **release** granularity. Update checkboxes when a release merges to `main`. Detailed task breakdown lives in PRs; this section answers "what's done" and "what's next."

**Status:** not started (as of spec draft)

| Release | Theme | Status |
|---------|-------|--------|
| A | Foundation — CLI, FGA config, fixed multi-server | ✅ Done |
| B | Agent ergonomics — defaults, optional store/model, policy | ✅ Done |
| C | Dynamic tier — `connection_scope`, runtime connect | ⬜ Not started |
| D | Polish — completions, resources, deprecations, docs | ⬜ Not started |

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

- [ ] `DynamicScopeStore` — scoped registries with UUID minting
- [ ] `connect_server`, `disconnect_server` tools
- [ ] `list_servers` with `connection_scope` (dynamic pool)
- [ ] Optional `connection_scope` on admin tools
- [ ] HTTP: scope required for dynamic tier; TTL eviction
- [ ] Stdio: at most one dynamic scope; scope optional when sole scope exists
- [ ] `allow_runtime_connect` config gate
- [ ] Unit + integration tests: scope minting, isolation, stdio single-scope policy

### Release D — Polish

- [ ] Completions scoped to resolved server/store
- [ ] Resource templates updated for `server` (+ scope when C is done)
- [ ] Deprecate HTTP `?config=` middleware (no-op + warning)
- [ ] README: `connection_scope` threading for HTTP clients
- [ ] Migration notes: legacy restrict → `restrict` + `writeable: false`

### Deferred (not in v1)

- [ ] Per-store alias maps
- [ ] `close_connection` vs auto-drop scope on last disconnect (decide at C)
- [ ] Resource URI redesign (`openfga://server/...`)
- [ ] Secret `token_env` indirection in FGA config
- [ ] External scope store (Redis) / multi-worker HTTP

### Internal groundwork (do in A, don't expose until needed)

Implement these in Release A so C doesn't require a handler rewrite:

- `resolveClient()` accepts `{ connectionScope?, server? }` but ignores scope until C
- Handler context carries `FixedServerPool` (and empty dynamic store stub if useful)
- Policy resolver shape matches spec even if B fills in behavior later

---

## Migration from current single-client model

See [Implementation plan](#implementation-plan) for staged rollout. Summary of end state:

1. `FixedServerPool` + optional `DynamicScopeStore` and unified `resolveClient()`
2. FGA config via `--config`; runtime via CLI/env
3. Optional `connection_scope`, `server`, `store`, `model` on admin tools
4. Connect/disconnect/list/set-default tools (fixed in B; dynamic in C)
5. Decoupled restrict and writeable guards
6. Deprecate HTTP `?config=`

---

## Open issues / decisions

### 1. Store aliases

Defer; agent uses `list_stores` for discovery.

### 2. Policy on dynamic servers

Dynamic profiles from `connect_server` inherit top-level `defaults` unless overridden on the profile. `restrict` and `writeable` are independent on dynamic entries, same as fixed.

### 3. Legacy restrict = read-only

Single-server deployments using `OPENFGA_MCP_API_RESTRICT=true` today get read-only behavior because restrict blocks writes in code. Bootstrap should map to `restrict: true` + `writeable: false` for equivalent behavior unless migration docs say otherwise.

### 4. Config delivery and secret indirection

Primary: `--config <path>` CLI flag. Env `OPENFGA_MCP_CONFIG` (file path only) as fallback when args unavailable. Secret fields via `token_env`-style references in config JSON TBD.

### 5. Legacy profile name

Use `default` for single `OPENFGA_MCP_API_URL` bootstrap unless `OPENFGA_MCP_DEFAULT_SERVER` is set.

### 6. `verify_model`

Ignore `connection_scope`, `server`, and `model` (local DSL only).

### 7. Per-store default model map

Defer mapping multiple stores per server (e.g. aliases); one `default_store` + `default_model` per server suffices for v1.

### 8. Disconnect entire scope

Explicit `close_connection` tool vs. `disconnect_server` removing last server drops scope — TBD.

### 9. Resource URIs

Include `connection_scope` and/or `server` in URI templates vs. MCP resource args only — TBD.

### 10. Scope TTL default

Suggested 24h idle for HTTP; configurable via env.

### 11. Published npm / MCP instructions

README and tool docs must describe `connection_scope` threading for HTTP clients and per-server store/model defaults. Track completion in [Implementation plan](#implementation-plan).

---

## References

- Current startup (env-only, no CLI): `src/index.ts`, `src/config.ts`, `src/server.ts`
- Deprecated HTTP config: `src/configurable-http.ts`
- Store/restrict guards: `src/guards.ts`
- Tool parameters: `src/tools/openfga.ts`
- MCP explicit handles: [SEP-2567](https://modelcontextprotocol.io/seps/2567-sessionless-mcp)
