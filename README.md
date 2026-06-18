# fga-mcp

TypeScript MCP server for [OpenFGA](https://openfga.dev/) and [Auth0 FGA](https://auth0.com/fine-grained-authorization). Gives agents tools, resources, prompts, and bundled documentation for working with fine-grained authorization — with or without a live OpenFGA server. 

Derived from the PHP-based [openfga-mcp](https://github.com/evansims/openfga-mcp) by [Evan Sims](https://github.com/evansims) ([Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)). This TypeScript port has the same configuration, tools, resources, prompts, and documentation features. The model authoring guide ([`docs/AUTHORING_OPENFGA_MODELS.md`](docs/AUTHORING_OPENFGA_MODELS.md)) is adapted from [openfga-modeling-mcp](https://github.com/aaguiarz/openfga-modeling-mcp) by [Andrés Aguiar](https://github.com/aaguiarz) ([MIT](https://opensource.org/licenses/MIT)).

This MCP server also adds support for multiple configured FGA servers, dynamic FGA server connections, and agent-isolated (out-of-band) authentication to FGA servers that require authentication.

Built with [FastMCP](https://github.com/punkpeye/fastmcp), [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk), [@openfga/sdk](https://www.npmjs.com/package/@openfga/sdk), and [@openfga/syntax-transformer](https://www.npmjs.com/package/@openfga/syntax-transformer). Requires Node.js **20+**.

## Operating modes

fga-mcp runs in one of three modes depending on how you configure it at startup. The agent sees the same MCP tools, resources, and prompts in each mode; what changes is whether it can interact with **live OpenFGA servers** and how those connections are set up.

### Offline

No OpenFGA URL or FGA config is supplied. The server exposes **documentation, prompts, and local tools** only — no store, model, or tuple operations against a live server.

Use offline mode when you want an agent to:

- Research OpenFGA concepts and read bundled docs
- Design authorization models (`verify_model`, authoring prompts)
- Explore DSL syntax and write FGA client code with doc search
- Troubleshoot relationship modeling without touching a live store

### Online — fixed servers

Supply an **FGA config file** (`--config`) with one or more named servers (`dev`, `prod`, …). fga-mcp loads those profiles at startup.

When a server has an **`auth` block** in config (or FGA allows unauthenticated access), agents call tools and read resources **without managing connections** — they pass an optional `server` name (or rely on `default_server`) and optional `store` / `model`. That is the usual production pattern: credentials and policy live in your config file.

When a fixed server is listed in config **without** `auth` but the OpenFGA backend requires authentication, credentials are collected at runtime via an **out-of-band browser flow** (HTTP only). Call `connect_server({ server })` when `list_servers` shows `auth_status: connect_required`. See [Runtime authentication](#runtime-authentication).

### Online — dynamic servers (optional)

When `allow_dynamic_connections: true` in the FGA config, agents can call **`connect_server({ api_url })`** to attach additional OpenFGA backends (dynamic tier). If that backend requires authentication, credentials are collected via the same out-of-band browser flow on connect — see [Runtime authentication](#runtime-authentication).

**`connect_server({ server })`** for fixed servers with `auth_status: connect_required` is separate — it does not require `allow_dynamic_connections`. Each connect mints or extends a **`connection_scope`** (UUID); subsequent scoped tool calls pass that scope plus `server`.

Dynamic servers suit local experimentation, ad-hoc OpenFGA servers, or controlled multi-tenant HTTP deployments. Fixed servers remain available alongside dynamic ones — omit `connection_scope` to target the fixed pool.

| Mode | Config | Agent connection management |
|------|--------|----------------------------|
| Offline | None | N/A — docs and local tools only |
| Fixed | `--config` with `servers.*` | None — use `server` param or default |
| Dynamic (`api_url`) | `--config` with `allow_dynamic_connections: true` | `connect_server({ api_url })` → `connection_scope` + `server` |
| Fixed auth (HTTP) | Fixed server in config, no `auth`, FGA requires auth | `connect_server({ server })` → `connection_scope` + `server` |

Call **`list_servers`** to discover fixed servers (`auth_status: connect_required` when connect is needed; field omitted when fixed direct works), whether dynamic `api_url` connect is enabled (`dynamic_connections_enabled`), and — with `connection_scope` — scoped entries with **`connected`**.

### Runtime authentication

OpenFGA credentials belong in the FGA config **`auth` block** or are collected **out of band** at runtime. They are **never** passed in tool arguments and never exposed to the MCP client (agent) or its models — the operator authenticates in a browser; fga-mcp stores credentials server-side only.

This requires **`--transport http`**. On stdio, put credentials in config or use an open FGA server.

| Scenario | When auth is elicited |
|----------|------------------------|
| **Fixed server** — in config, no `auth`, FGA requires auth | On `connect_server({ server })` when `list_servers` shows `auth_status: connect_required` |
| **Dynamic server** — `connect_server({ api_url })` | On connect, when the target FGA requires auth |
| **Scoped connection** — credentials expired or rejected | When an FGA tool returns 401; retry that tool after completing auth |

**Agent flow:** the connect or FGA tool returns an auth URL. Open it in a browser, submit credentials, then **retry the same tool call** with identical arguments. Hosted forms are served at `/auth/elicit/:id` on the same origin as `/mcp`.

For MCP response shapes, FastMCP patch notes, and `--public-url`, see [Auth elicitation (HTTP)](#auth-elicitation-http) below and [`specs/openfga-auth-elicitation.md`](specs/openfga-auth-elicitation.md).

## Quick start

Configuration is passed as **CLI args** (preferred). The same args work for stdio subprocess launch and for running a standalone HTTP server. Environment variables are a fallback when a client cannot pass args — see [Environment variables](#environment-variables).

### 1. Offline (stdio)

Cursor / Claude Desktop — no OpenFGA connection:

```json
{
  "mcpServers": {
    "OpenFGA": {
      "command": "npx",
      "args": ["fga-mcp"]
    }
  }
}
```

### 2. Online with fixed servers (stdio)

Point at an FGA config file with your servers. The MCP client spawns fga-mcp as a subprocess over stdio:

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

Example `fga-mcp.json`:

```json
{
  "default_server": "dev",
  "defaults": { "writeable": false },
  "servers": {
    "dev": {
      "api_url": "http://127.0.0.1:8080",
      "default_store": "01HXYZ...",
      "writeable": true
    },
    "prod": {
      "api_url": "https://api.us1.fga.dev",
      "auth": {
        "method": "api_token",
        "token": "YOUR_TOKEN"
      },
      "default_store": "01HABC...",
      "default_model": "01HMODEL...",
      "restrict": true,
      "writeable": false
    }
  }
}
```

Write operations are disabled by default (`writeable: false`). Set `writeable: true` on a server profile or in `defaults` to allow store/model/tuple mutations.

On **stdio**, put OpenFGA credentials in each server’s `auth` block (or use an open FGA server). Browser-based credential elicitation requires **`--transport http`**. On HTTP, omit `connection_scope` for fixed servers unless `list_servers` shows **`auth_status: connect_required`**.

### 3. HTTP transport

Run fga-mcp as a **standalone HTTP MCP server**, then point any MCP client at its URL. Use the **same `--config` and transport flags** you would pass on the CLI — the FGA config file is shared between stdio and HTTP deployments.

HTTP transport is required for **URL-mode auth elicitation** (runtime credential collection via browser when `auth` is omitted from config). Hosted auth forms are served on the same origin as `/mcp`.

**Start the server:**

```bash
npx fga-mcp --config ./fga-mcp.json --transport http --host 127.0.0.1 --port 9090
```

The server listens for MCP streamable HTTP at `http://127.0.0.1:9090/mcp` (SSE also available at `/sse`).

**Connect a client by URL** (Cursor, Claude Desktop, or other streamable-HTTP MCP clients):

```json
{
  "mcpServers": {
    "OpenFGA": {
      "url": "http://127.0.0.1:9090/mcp"
    }
  }
}
```

HTTP is useful when the MCP server runs in Docker, on a shared host, or behind your own auth proxy. Put authentication and rate limiting at the HTTP edge; fga-mcp does not replace that layer.

For production HTTP deployments, prefer **fixed servers with `auth` in config** when possible. Set `allow_dynamic_connections: false` unless agents must register arbitrary `api_url` backends. When using scoped servers (dynamic or fixed `connect_required`), **`connection_scope` is required** on HTTP for all FGA tool calls (stdio may omit it when exactly one scope exists).

### Auth elicitation (HTTP)

Details for operators and integrators. The [runtime auth model](#runtime-authentication) above is the summary agents and config authors need.

When an OpenFGA server requires authentication and credentials are not in the FGA config, fga-mcp serves a **hosted auth form** at `/auth/elicit/:id` on the same origin as `/mcp`. Supported methods: pre-shared key and OIDC client credentials.

**Configuration:**

- `--public-url` / `OPENFGA_MCP_PUBLIC_URL` — browser-reachable origin for elicitation links (defaults to `http://127.0.0.1:<port>`).
- Credentials are never accepted in `connect_server` tool parameters — only via the hosted form or FGA config `auth` block.

**Client response shape:** MCP clients that declare URL elicitation receive error code `-32042` with the auth URL; others receive a structured tool error that includes the same URL. Both use the same hosted form.

**FastMCP patch:** URL elicitation (`-32042`) requires a local `patch-package` fix to FastMCP 4.3.0 (`patches/fastmcp+4.3.0.patch`) so `UrlElicitationRequiredError` is not wrapped as a generic tool error. Applied on `npm install` via `postinstall`. Remove after upstream fix ([issue #162](https://github.com/punkpeye/fastmcp/issues/162)).

**stdio:** URL elicitation is unavailable. Put credentials in the FGA config `auth` block, use an open FGA server, or run with `--transport http`.

### From npm or source

```bash
npx fga-mcp --help
```

```bash
git clone https://github.com/BobDickinson/fga-mcp.git
cd fga-mcp
npm install
npm run build
node dist/index.js --config ./fga-mcp.json
```

For development with hot reload, use `tsx` on `src/index.ts` in the MCP client `command` / `args` instead of `npx fga-mcp`.

### Docker

```bash
docker build -t fga-mcp .
docker run --rm -p 9090:9090 fga-mcp \
  --config /path/in/container/fga-mcp.json \
  --transport http --host 0.0.0.0 --port 9090
```

Mount your FGA config into the container. Port `9090` is exposed for HTTP transport.

## FGA config file

The FGA config JSON is the primary way to define OpenFGA servers, defaults, and policy. Pass it with `--config <path>` or, when CLI args are unavailable, via `OPENFGA_MCP_CONFIG` (file path or inline JSON for containers).

| Field | Default | Purpose |
|-------|---------|---------|
| `default_server` | First server / `default` | Default `server` when omitted on tool calls |
| `allow_dynamic_connections` | **`false`** | Enable dynamic tier — `connect_server({ api_url })` for arbitrary backends; opt-in only |
| `defaults.*` | `writeable: false`, `restrict: false` | Global policy and store/model defaults |
| `servers.*` | — | Fixed OpenFGA servers loaded at startup |
| `dynamic.*` | See [Dynamic tier](#dynamic-tier) | Scope TTL and caps (ignored when `allow_dynamic_connections` is false; fixed `connect_server({ server })` uses the same scope store) |

Per-server `default_store` and `default_model` belong on each entry in multi-server setups. Top-level `defaults.default_store` / `default_model` apply to legacy single-server env bootstrap only.

When no `--config` is passed, legacy `OPENFGA_MCP_API_*` environment variables bootstrap a single fixed server named `default` (or `OPENFGA_MCP_DEFAULT_SERVER`). Prefer the config file for new setups — see [Migrating from legacy env](#migrating-from-legacy-env).

### Policy: restrict vs writeable

`restrict` and `writeable` are **independent** per server (or global defaults):

- **`restrict: true`** — operations must use the pinned `default_store` / `default_model` when provided.
- **`writeable: true`** — allows mutations (create/delete stores, models, tuples).

A read-only prod server uses `restrict: true` with `writeable: false`. Legacy env setups that relied on `OPENFGA_MCP_API_RESTRICT=true` blocking writes should set **both** in FGA config — `restrict` alone no longer disables writes.

## Dynamic tier

Runtime connect is **disabled by default**. Enable it in the FGA config:

```json
{
  "allow_dynamic_connections": true,
  "dynamic": {
    "scope_idle_ttl_seconds": 86400,
    "max_servers_per_scope": 10,
    "max_scopes": 100
  },
  "servers": {
    "dev": { "api_url": "http://127.0.0.1:8080" }
  }
}
```

Omit `dynamic` for defaults (`scope_idle_ttl_seconds`: 86400, `max_servers_per_scope`: 10, `max_scopes`: 100 on HTTP). Set any limit to **`null`** to disable that cap or idle eviction.

**Workflow:**

1. Call `connect_server({ api_url })`. If FGA requires auth, complete the [out-of-band auth flow](#runtime-authentication) and retry. Response includes `connection_scope` and the **assigned** `server` name.
2. Pass both on subsequent admin and relationship tool calls.
3. Call `disconnect_server` when done. Removing the last server in a scope drops the scope.

**Transport rules:**

| | Stdio | HTTP |
|---|-------|------|
| `connection_scope` on dynamic calls | Optional when exactly one dynamic scope exists | Required |
| Max dynamic scopes | 1 | `dynamic.max_scopes` (default 100) |
| Idle scope cleanup | Process exit | `dynamic.scope_idle_ttl_seconds` (default 24h) |

Scope IDs are unguessable UUIDs minted by the server — pass them on tool arguments. Tokens and secrets are never logged.

## Agent routing

Admin and relationship tools accept optional routing parameters:

| Parameter | Applies to | Description |
|-----------|------------|-------------|
| `connection_scope` | Admin tools, relationship tools (dynamic tier) | Scope UUID from `connect_server`; omit for fixed servers |
| `server` | Admin tools, relationship tools | Named OpenFGA server (fixed config or assigned dynamic name) |
| `store` | Relationship tools | Store ID; falls back to server `default_store` |
| `model` | Relationship tools | Model ID; falls back to server `default_model` or `"latest"` |

Use **`list_servers`** to see fixed servers and `dynamic_connections_enabled`. Pass `connection_scope` to also list dynamic servers for that scope. Use **`set_default_server`** to change the default within the fixed pool or a dynamic scope.

When multiple fixed servers exist, admin resource URIs are server-prefixed (`openfga://server/{server}/store/...`). With runtime connect, dynamic reads use scope-prefixed URIs (`openfga://scope/{connectionScope}/server/{server}/store/...`). Tool calls and resource reads share the same resolution rules.

## Features

### Tools (21)

- **Stores:** `create_store`, `delete_store`, `get_store`, `list_stores`
- **Models:** `create_model`, `get_model`, `get_model_dsl`, `list_models`, `verify_model`
- **Permissions:** `check_permission`, `grant_permission`, `revoke_permission`, `list_objects`, `list_users`
- **Servers:** `list_servers`, `set_default_server`, `connect_server`, `disconnect_server`
- **Documentation:** `find_similar_documentation`, `search_code_examples`, `search_documentation`

### Resources

Admin resource templates are registered **at startup based on FGA config**. Documentation resources (`openfga://docs/...`) are always available and do not require a live OpenFGA instance.

| Deployment | Admin URI tier | Example |
|------------|----------------|---------|
| Offline (no servers) | None — docs only | `openfga://docs` |
| Single fixed server, no runtime connect | **Legacy** — server implicit | `openfga://store/{storeId}/model/{modelId}` |
| Multiple fixed servers | **Server-prefixed** | `openfga://server/{server}/store/{storeId}/...` |
| Runtime connect enabled | **Scope-prefixed** for dynamic reads | `openfga://scope/{connectionScope}/server/{server}/store/{storeId}/...` |

When both fixed and dynamic tiers are enabled, both template families are registered. Dynamic-tier resource names use a `_scoped` suffix when they coexist with fixed-tier templates.

Seven documentation endpoints are always registered. With a single fixed server online, add one static `list_stores` resource and nine admin templates (17 total endpoints).

### Prompts (17)

Model design, authoring guidance, security guidance, and relationship troubleshooting prompts.

### Completions

When connected to a live OpenFGA instance, argument completion is provided for store IDs, model IDs, relations, users, objects, and documentation identifiers.

## CLI reference

Runtime transport settings use CLI flags first, then env, then defaults:

| Flag | Env fallback | Default |
|------|--------------|---------|
| `--config <path>` | `OPENFGA_MCP_CONFIG` (file path or inline JSON) | — |
| `--transport stdio\|http` | `OPENFGA_MCP_TRANSPORT` | `stdio` |
| `--host <addr>` | `OPENFGA_MCP_TRANSPORT_HOST` | `127.0.0.1` |
| `--port <n>` | `OPENFGA_MCP_TRANSPORT_PORT` | `9090` |
| `--sse` / `--no-sse` | `OPENFGA_MCP_TRANSPORT_SSE` | `true` |
| `--stateless` / `--no-stateless` | `OPENFGA_MCP_TRANSPORT_STATELESS` | `false` |
| `--public-url <origin>` | `OPENFGA_MCP_PUBLIC_URL` | — (see below) |
| `--debug` / `--no-debug` | `OPENFGA_MCP_DEBUG` | `true` |

FGA connection settings (`servers`, `defaults`, `allow_dynamic_connections`, …) belong in the **config file**, not on the CLI. The same config file works for stdio subprocess and HTTP server launch modes.

`--public-url` is the browser-reachable origin for auth elicitation links (e.g. `https://fga-mcp.example.com`). Omit for local dev — defaults to `http://127.0.0.1:<port>`. Distinct from `--host`, which is the bind address only.

## Environment variables

Use env vars when an MCP client cannot pass CLI args (e.g. some hosted runners), or for legacy single-server bootstrap without a config file.

### Transport and runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENFGA_MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `OPENFGA_MCP_TRANSPORT_HOST` | `127.0.0.1` | HTTP bind address |
| `OPENFGA_MCP_TRANSPORT_PORT` | `9090` | HTTP port |
| `OPENFGA_MCP_TRANSPORT_SSE` | `true` | Enable SSE for HTTP transport |
| `OPENFGA_MCP_TRANSPORT_STATELESS` | `false` | Stateless HTTP sessions |
| `OPENFGA_MCP_PUBLIC_URL` | | Public origin for auth elicitation URLs (e.g. `https://fga-mcp.example.com`); default `http://127.0.0.1:<port>` |
| `OPENFGA_MCP_DEBUG` | `true` | Write debug logs to `logs/mcp-debug.log` |
| `OPENFGA_MCP_CONFIG` | | FGA config file path or inline JSON |

### Legacy single-server bootstrap

When no config file is loaded, these env vars create one fixed server named `default` (or `OPENFGA_MCP_DEFAULT_SERVER`):

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENFGA_MCP_DEFAULT_SERVER` | `default` | Name for the bootstrap server |
| `OPENFGA_MCP_API_URL` | | OpenFGA server URL |
| `OPENFGA_MCP_API_WRITEABLE` | `false` | Enable writes (prefer FGA config `writeable`) |
| `OPENFGA_MCP_API_STORE` | | Default/restrict store ID |
| `OPENFGA_MCP_API_MODEL` | | Default/restrict model ID |
| `OPENFGA_MCP_API_RESTRICT` | `false` | Lock to configured store/model |
| `OPENFGA_MCP_API_TOKEN` | | Pre-shared API token → `auth: { method: "api_token", token: "..." }` |
| `OPENFGA_MCP_API_CLIENT_ID` | | OAuth client ID → `auth.method: "client_credentials"` |
| `OPENFGA_MCP_API_CLIENT_SECRET` | | OAuth client secret |
| `OPENFGA_MCP_API_ISSUER` | | OAuth token issuer |
| `OPENFGA_MCP_API_AUDIENCE` | | OAuth audience (optional) |

| Env var | FGA config equivalent |
|---------|----------------------|
| `OPENFGA_MCP_API_URL` (+ auth) | single `servers.default` |
| `OPENFGA_MCP_API_WRITEABLE` | `defaults.writeable` |
| `OPENFGA_MCP_API_RESTRICT` | `defaults.restrict` |
| `OPENFGA_MCP_API_STORE` | `defaults.default_store` |
| `OPENFGA_MCP_API_MODEL` | `defaults.default_model` |

### Migrating from legacy env

1. Replace flat `OPENFGA_MCP_API_*` vars with an FGA config file (`--config`) when you need multiple servers or per-server policy.
2. Map `OPENFGA_MCP_API_RESTRICT=true` to `restrict: true` **and** `writeable: false` for read-only prod.
3. Map `OPENFGA_MCP_API_WRITEABLE=true` to `writeable: true` on the server profile or in `defaults`.
4. The bootstrap server is named `default` unless `OPENFGA_MCP_DEFAULT_SERVER` is set.
5. Call `list_servers` to discover fixed servers and whether `connect_server` is available.

## Project structure

```
src/
  index.ts                  # Entry point
  cli.ts                    # CLI arg parser
  runtime-config.ts         # Transport/runtime config (CLI + env)
  fga-config.ts             # FGA JSON config loader
  server-pool.ts            # Fixed multi-server pool + policy resolution
  dynamic-scope-store.ts    # Runtime connect scopes
  connection-resolver.ts    # Unified client resolution
  admin-context.ts          # Server/store/model resolution for handlers
  resource-resolver.ts      # Resource URI normalization + resolution
  server.ts                 # Server bootstrap, transport, lifecycle
  config.ts                 # Environment configuration
  guards.ts                 # Offline/write/restrict checks
  connect-flow.ts           # connect_server probe + elicitation orchestration
  auth-probe.ts             # Unauthenticated FGA probe + credential validation
  openfga-auth-error.ts     # 401 classifier for re-elicit vs refresh
  fga-call.ts               # Scoped FGA error → reauth elicitation
  elicitation/              # Session registry, pending store, elicitation request helper
  auth/                     # Hosted Pre-shared / OIDC auth form routes (HTTP)
  client.ts                 # Server context + OpenFGA client access
  dsl.ts                    # DSL parse/validate via syntax-transformer
  documentation/            # Bundled docs index, search, and chunker
  tools/                    # MCP tools
  resources/                # MCP resources (admin.ts, documentation)
  prompts/                  # MCP prompts
  completions/              # Argument completion helpers
docs/                       # Synced SDK documentation
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server (`node dist/index.js`) |
| `npm run dev` | Run with `tsx` (no build step) |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run unit tests |
| `npm run test:unit` | Run unit tests with coverage |
| `npm run test:integration` | Run integration tests (requires OpenFGA at `OPENFGA_MCP_API_URL`) |
| `npm run test:integration:docker` | Run integration tests in Docker (recommended) |
| `npm run docs:sync` | Sync bundled documentation from upstream repos |
| `npm publish` | Publish to npm (runs unit tests, then build via lifecycle hooks) |

## License

MIT
