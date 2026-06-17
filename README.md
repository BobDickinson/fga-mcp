# fga-mcp

TypeScript MCP server for [OpenFGA](https://openfga.dev/) and [Auth0 FGA](https://auth0.com/fine-grained-authorization), cloned from [openfga-mcp](https://github.com/evansims/openfga-mcp) (PHP) with the same configuration, tools, resources, prompts, and documentation features.

The model authoring guide ([`docs/AUTHORING_OPENFGA_MODELS.md`](docs/AUTHORING_OPENFGA_MODELS.md)) is adapted from [openfga-modeling-mcp](https://github.com/aaguiarz/openfga-modeling-mcp) (MIT License) by [Andrés Aguiar](https://github.com/aaguiarz).

Requires Node.js **20+**.

Built with:

- [FastMCP](https://github.com/punkpeye/fastmcp) (TypeScript MCP framework)
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [@openfga/sdk](https://www.npmjs.com/package/@openfga/sdk)
- [@openfga/syntax-transformer](https://www.npmjs.com/package/@openfga/syntax-transformer) for DSL parsing

## Quick Start

### From npm

```bash
npx fga-mcp
```

Offline mode works without an OpenFGA server — prompts and documentation tools/resources are available.

### Cursor / Claude Desktop config

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

### Online mode

Set environment variables to connect to a live OpenFGA instance:

```json
{
  "mcpServers": {
    "OpenFGA": {
      "command": "npx",
      "args": ["fga-mcp"],
      "env": {
        "OPENFGA_MCP_API_URL": "http://127.0.0.1:8080"
      }
    }
  }
}
```

Write operations are disabled by default. Set `OPENFGA_MCP_API_WRITEABLE=true` (legacy env) or `writeable: true` in the FGA config file to enable store/model/tuple mutations.

### FGA config file (multi-server)

Use `--config` to load a JSON file with named OpenFGA backends:

```bash
npx fga-mcp --config ./fga-mcp.json
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
      "api_token": "YOUR_TOKEN",
      "default_store": "01HABC...",
      "default_model": "01HMODEL...",
      "restrict": true,
      "writeable": false
    }
  }
}
```

Cursor / Claude Desktop with a config file:

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

When no `--config` is passed, legacy `OPENFGA_MCP_API_*` env vars bootstrap a single fixed server named `default` (or `OPENFGA_MCP_DEFAULT_SERVER` if set).

**Config delivery:** Pass a file path via `--config` or `OPENFGA_MCP_CONFIG`. When CLI flags are unavailable (e.g. some MCP clients), `OPENFGA_MCP_CONFIG` may be a **file path** or **inline JSON** for container env injection.

| FGA config field | Default | Purpose |
|------------------|---------|---------|
| `default_server` | First server / `default` | Default `server` when omitted on tool calls |
| `allow_runtime_connect` | **`false`** | Enable dynamic tier (`connect_server`); opt-in only |
| `defaults.*` | `writeable: false`, `restrict: false` | Global policy and store/model defaults |
| `servers.*` | — | Fixed FGA backends at startup |
| `dynamic.*` | See [Dynamic tier](#dynamic-tier-runtime-connect) | Scope TTL and caps (ignored when `allow_runtime_connect` is false) |

Per-server `default_store` and `default_model` belong on each entry in multi-server setups. Top-level `defaults.default_store` / `default_model` apply to legacy single-server bootstrap only.

**Legacy env mapping** (when no config file):

| Env var | Config equivalent |
|---------|-------------------|
| `OPENFGA_MCP_API_URL` (+ auth) | single `servers.default` |
| `OPENFGA_MCP_DEFAULT_SERVER` | Renames the sole bootstrap server (default: `default`) |
| `OPENFGA_MCP_API_WRITEABLE` | `defaults.writeable` |
| `OPENFGA_MCP_API_RESTRICT` | `defaults.restrict` |
| `OPENFGA_MCP_API_STORE` | `defaults.default_store` |
| `OPENFGA_MCP_API_MODEL` | `defaults.default_model` |

### CLI flags

Runtime transport settings use CLI flags first, then env, then defaults:

| Flag | Env fallback | Default |
|------|--------------|---------|
| `--config <path>` | `OPENFGA_MCP_CONFIG` (file path or inline JSON) | — |
| `--transport stdio\|http` | `OPENFGA_MCP_TRANSPORT` | `stdio` |
| `--host <addr>` | `OPENFGA_MCP_TRANSPORT_HOST` | `127.0.0.1` |
| `--port <n>` | `OPENFGA_MCP_TRANSPORT_PORT` | `9090` |
| `--sse` / `--no-sse` | `OPENFGA_MCP_TRANSPORT_SSE` | `true` |
| `--stateless` / `--no-stateless` | `OPENFGA_MCP_TRANSPORT_STATELESS` | `false` |
| `--debug` / `--no-debug` | `OPENFGA_MCP_DEBUG` | `true` |

Example:

```bash
npx fga-mcp --config ./fga-mcp.json --transport http --port 9090
```

### From source (development)

```bash
git clone https://github.com/BobDickinson/fga-mcp.git
cd fga-mcp
npm install
npm run build
npm start
```

For development with hot reload:

```json
{
  "mcpServers": {
    "OpenFGA": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/fga-mcp/src/index.ts"]
    }
  }
}
```

### HTTP transport

Set `OPENFGA_MCP_TRANSPORT=http` to listen on `OPENFGA_MCP_TRANSPORT_HOST` / `OPENFGA_MCP_TRANSPORT_PORT` (default `127.0.0.1:9090`). Configure backends via `--config`, env vars, or `connect_server` (dynamic tier) — not per-request query parameters.

For **production HTTP** deployments:

- Prefer **fixed servers** in the FGA config file (`allow_runtime_connect: false`). Use runtime connect only for local experiments or controlled multi-tenant setups.
- Dynamic **`connection_scope`** is required on tool calls over HTTP (stdio may omit it when exactly one dynamic scope exists).
- Scope IDs are unguessable UUIDs minted by the server; pass them on tool arguments — do not use auth `userId` as a scope key.
- Idle dynamic scopes are evicted after `dynamic.scope_idle_ttl_seconds` (default 24h). Caps: `max_servers_per_scope`, `max_scopes`.
- Put authentication and rate limiting at the HTTP edge; per-scope limits bound leaks per session, not cross-tenant abuse.
- Tokens and secrets are never logged. Prefer env-based secrets over literals in config files committed to git.

### Docker

```bash
docker build -t fga-mcp .
docker run --rm -i fga-mcp
```

Set `-e OPENFGA_MCP_API_URL=...` (and other env vars) as needed. Port `9090` is exposed for HTTP transport.

## Configuration

Environment variables match the PHP reference server:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENFGA_MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `OPENFGA_MCP_TRANSPORT_HOST` | `127.0.0.1` | HTTP bind address |
| `OPENFGA_MCP_TRANSPORT_PORT` | `9090` | HTTP port |
| `OPENFGA_MCP_TRANSPORT_SSE` | `true` | Enable SSE for HTTP transport |
| `OPENFGA_MCP_TRANSPORT_STATELESS` | `false` | Stateless HTTP sessions |
| `OPENFGA_MCP_DEBUG` | `true` | Write debug logs to `logs/mcp-debug.log` |
| `OPENFGA_MCP_CONFIG` | | FGA config file path or inline JSON (when `--config` is not passed) |
| `OPENFGA_MCP_DEFAULT_SERVER` | `default` | Name for the sole server when bootstrapping from legacy env vars |
| `OPENFGA_MCP_API_URL` | | OpenFGA server URL |
| `OPENFGA_MCP_API_WRITEABLE` | `false` | Enable write operations (legacy; prefer FGA config `writeable`) |
| `OPENFGA_MCP_API_STORE` | | Restrict/default store ID (legacy; prefer FGA config) |
| `OPENFGA_MCP_API_MODEL` | | Restrict/default model ID (legacy; prefer FGA config) |
| `OPENFGA_MCP_API_RESTRICT` | `false` | Lock to configured store/model (legacy; independent of `writeable`) |
| `OPENFGA_MCP_API_TOKEN` | | Pre-shared API token |
| `OPENFGA_MCP_API_CLIENT_ID` | | OAuth client ID |
| `OPENFGA_MCP_API_CLIENT_SECRET` | | OAuth client secret |
| `OPENFGA_MCP_API_ISSUER` | | OAuth token issuer |
| `OPENFGA_MCP_API_AUDIENCE` | | OAuth audience |

When debug logging is enabled, tool calls and transport events are recorded via `withToolLogging()` and the FastMCP logger.

### Policy: restrict vs writeable

`restrict` and `writeable` are independent per server (or global defaults):

- **`restrict: true`** — operations must use the pinned `default_store` / `default_model` when provided.
- **`writeable: true`** — allows mutations (create/delete stores, models, tuples).

A restricted read-only prod server can use `restrict: true` with `writeable: false`. Legacy env setups that relied on `OPENFGA_MCP_API_RESTRICT=true` blocking writes should set both `restrict: true` and `writeable: false` in FGA config for equivalent behavior — `restrict` alone no longer disables writes.

### Migrating from legacy single-server env

1. Replace flat `OPENFGA_MCP_API_*` vars with an FGA config file (`--config`) when you need multiple servers or per-server policy.
2. Map `OPENFGA_MCP_API_RESTRICT=true` to `restrict: true` **and** `writeable: false` if you want read-only prod (restrict and writeable are independent).
3. Map `OPENFGA_MCP_API_WRITEABLE=true` to `writeable: true` on the server profile or in `defaults`.
4. The bootstrap server is named `default` unless `OPENFGA_MCP_DEFAULT_SERVER` is set.
5. Call `list_servers` to discover fixed backends and whether `connect_server` is available (`runtime_connect_enabled`).

### Optional tool parameters

Admin and relationship tools accept optional routing parameters:

| Parameter | Applies to | Description |
|-----------|------------|-------------|
| `connection_scope` | Admin tools, relationship tools (dynamic tier) | Scope UUID from `connect_server`; omit for fixed servers |
| `server` | Admin tools, relationship tools | Named backend (fixed config or assigned dynamic name) |
| `store` | Relationship tools | Store ID; falls back to server `default_store` |
| `model` | Relationship tools | Model ID; falls back to server `default_model` or `"latest"` |

Use `list_servers` to see fixed backends, whether runtime connect is enabled (`runtime_connect_enabled`), and — with `connection_scope` — dynamic servers in that scope. Use `set_default_server` to change the default within the fixed pool or a dynamic scope.

### Dynamic tier (runtime connect)

Runtime connect is **disabled by default** (`allow_runtime_connect: false`). Set `"allow_runtime_connect": true` in the FGA config to enable runtime backends via `connect_server`. Dynamic servers live in isolated **connection scopes** (UUIDs returned by the server).

```json
{
  "allow_runtime_connect": true,
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

Omit a `dynamic` field for defaults (`scope_idle_ttl_seconds`: 86400, `max_servers_per_scope`: 10, `max_scopes`: 100 on HTTP). Set any limit to **`null`** to disable that cap or idle eviction.

**Workflow:**

1. Call `connect_server` with `api_url` (and auth). The response includes `connection_scope` and the **assigned** `server` name.
2. Pass both on subsequent admin/relationship tool calls.
3. Call `disconnect_server` when done. Removing the last server in a scope drops the scope.

**Transport rules:**

| | Stdio | HTTP |
|---|-------|------|
| `connection_scope` on admin tools | Optional when exactly one dynamic scope exists | Required for dynamic-tier calls |
| Max dynamic scopes | 1 | `dynamic.max_scopes` (default 100) |
| Idle scope cleanup | Process exit | `dynamic.scope_idle_ttl_seconds` (default 24h) |

Without `connection_scope`, tools target **fixed** servers from startup config. Call `list_servers` to see fixed servers and `runtime_connect_enabled`; pass `connection_scope` to also list dynamic servers for that scope.

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

When both fixed and dynamic tiers are enabled, both template families are registered. Dynamic-tier resource names use a `_scoped` suffix when they coexist with fixed-tier templates. Omitting `connectionScope` in a dynamic URI targets the fixed pool; dynamic reads require `connectionScope` in the path (required on HTTP; optional on stdio when exactly one dynamic scope exists).

**HTTP clients:** pass `connection_scope` from `connect_server` in dynamic-tier resource URIs. Tool calls and resource reads share the same resolution rules (`resolveResourceTarget` mirrors admin tool routing).

Seven documentation endpoints (`get_documentation_index` plus six templates) are always registered. With a single fixed server online, add one static `list_stores` resource and nine admin templates (17 total endpoints).

### Prompts (17)

Model design, authoring guidance, security guidance, and relationship troubleshooting prompts.

### Completions

When connected to a live OpenFGA instance, argument completion is provided for store IDs, model IDs, relations, users, objects, and documentation identifiers.

## Project structure

```
src/
  index.ts                  # Entry point
  cli.ts                    # CLI arg parser
  runtime-config.ts         # Transport/runtime config (CLI + env)
  fga-config.ts             # FGA JSON config loader
  server-pool.ts            # Fixed multi-server pool + policy resolution
  admin-context.ts          # Server/store/model resolution for handlers
  server.ts                 # Server bootstrap, transport, lifecycle
  config.ts                 # Environment configuration
  debug-logger.ts           # Debug log file output
  tool-logging.ts           # Tool call logging wrapper
  guards.ts                 # Offline/write/restrict checks
  client.ts                 # Server context + OpenFGA client access
  dsl.ts                    # DSL parse/validate via syntax-transformer
  documentation/            # Bundled docs index, search, and chunker
  tools/                    # MCP tools
  resource-resolver.ts     # Resource URI normalization + connection resolution
  resources/                # MCP resources (admin.ts, documentation)
  prompts/                  # MCP prompts
  completions/              # Argument completion helpers
docs/                       # Synced SDK documentation (from openfga-mcp)
tools/documentation-sync/   # Script to refresh docs/
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
| `npm run test:integration:docker` | Run integration tests in Docker (includes dynamic-tier and resource resolution tests) |
| `npm run docs:sync` | Sync bundled documentation from upstream repos |
| `npm publish` | Publish to npm (runs unit tests, then build via lifecycle hooks) |

## License

MIT
