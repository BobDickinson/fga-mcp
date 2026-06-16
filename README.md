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

When no `--config` is passed, legacy `OPENFGA_MCP_API_*` env vars bootstrap a single fixed server named `default`.

### CLI flags

Runtime transport settings use CLI flags first, then env, then defaults:

| Flag | Env fallback | Default |
|------|--------------|---------|
| `--config <path>` | `OPENFGA_MCP_CONFIG` (file path) | — |
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

Set `OPENFGA_MCP_TRANSPORT=http` to listen on `OPENFGA_MCP_TRANSPORT_HOST` / `OPENFGA_MCP_TRANSPORT_PORT` (default `127.0.0.1:9090`).

When using HTTP transport, each request to `/mcp` may include a `config` query parameter containing URL-encoded JSON of `OPENFGA_MCP_*` settings. Those values are applied for that request before MCP handling (same keys as the environment variables below).

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

A restricted read-only prod server can use `restrict: true` with `writeable: false`. Legacy env setups that relied on `OPENFGA_MCP_API_RESTRICT=true` blocking writes should set both `restrict: true` and `writeable: false` in FGA config for equivalent behavior.

### Optional tool parameters

Admin and relationship tools accept optional routing parameters:

| Parameter | Applies to | Description |
|-----------|------------|-------------|
| `server` | Admin tools, relationship tools | Named backend from FGA config (default: `default_server`) |
| `store` | Relationship tools | Store ID; falls back to server `default_store` |
| `model` | Relationship tools | Model ID; falls back to server `default_model` or `"latest"` |

Use `list_servers` to see connected backends and `set_default_server` to change the session default.

## Features

### Tools (19)

- **Stores:** `create_store`, `delete_store`, `get_store`, `list_stores`
- **Models:** `create_model`, `get_model`, `get_model_dsl`, `list_models`, `verify_model`
- **Permissions:** `check_permission`, `grant_permission`, `revoke_permission`, `list_objects`, `list_users`
- **Servers:** `list_servers`, `set_default_server`
- **Documentation:** `find_similar_documentation`, `search_code_examples`, `search_documentation`

### Resources (17)

Two static resources (`list_stores`, `get_documentation_index`) and 15 resource templates covering OpenFGA admin URIs (`openfga://stores`, `openfga://store/{storeId}/...`) and documentation URIs (`openfga://docs/...`).

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
  configuration-parser.ts   # JSON config parsing (HTTP ?config= param)
  configurable-http.ts      # Per-request HTTP configuration middleware
  debug-logger.ts           # Debug log file output
  tool-logging.ts           # Tool call logging wrapper
  guards.ts                 # Offline/write/restrict checks
  client.ts                 # Server context + OpenFGA client access
  dsl.ts                    # DSL parse/validate via syntax-transformer
  documentation/            # Bundled docs index, search, and chunker
  tools/                    # MCP tools
  resources/                # MCP resources
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
| `npm run test:integration` | Run integration tests |
| `npm run test:integration:docker` | Run integration tests in Docker |
| `npm run docs:sync` | Sync bundled documentation from upstream repos |
| `npm publish` | Publish to npm (runs unit tests, then build via lifecycle hooks) |

## License

MIT
