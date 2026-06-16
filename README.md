# fga-mcp

TypeScript MCP server for [OpenFGA](https://openfga.dev/) and [Auth0 FGA](https://auth0.com/fine-grained-authorization), cloned from [openfga-mcp](https://github.com/evansims/openfga-mcp) (PHP) with the same configuration, tools, resources, prompts, and documentation features.

The model authoring guide ([`docs/AUTHORING_OPENFGA_MODELS.md`](docs/AUTHORING_OPENFGA_MODELS.md)) is adapted from [openfga-modeling-mcp](https://github.com/aaguiarz/openfga-modeling-mcp) by [Andrés Aguiar](https://github.com/aaguiarz).

Requires Node.js **20+**.

Built with:

- [FastMCP](https://github.com/punkpeye/fastmcp) (TypeScript MCP framework)
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [@openfga/sdk](https://www.npmjs.com/package/@openfga/sdk)
- [@openfga/syntax-transformer](https://www.npmjs.com/package/@openfga/syntax-transformer) for DSL parsing

## Quick Start

### Install and run (offline mode)

```bash
npm install
npm run build
npm start
```

Offline mode works without an OpenFGA server — prompts and documentation tools/resources are available.

### Cursor / Claude Desktop config

```json
{
  "mcpServers": {
    "OpenFGA": {
      "command": "node",
      "args": ["/absolute/path/to/fga-mcp/dist/index.js"]
    }
  }
}
```

For development:

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

### Online mode

Set environment variables to connect to a live OpenFGA instance:

```json
{
  "mcpServers": {
    "OpenFGA": {
      "command": "node",
      "args": ["/absolute/path/to/fga-mcp/dist/index.js"],
      "env": {
        "OPENFGA_MCP_API_URL": "http://127.0.0.1:8080"
      }
    }
  }
}
```

Write operations are disabled by default. Set `OPENFGA_MCP_API_WRITEABLE=true` to enable store/model/tuple mutations.

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
| `OPENFGA_MCP_API_WRITEABLE` | `false` | Enable write operations |
| `OPENFGA_MCP_API_STORE` | | Restrict/default store ID |
| `OPENFGA_MCP_API_MODEL` | | Restrict/default model ID |
| `OPENFGA_MCP_API_RESTRICT` | `false` | Lock to configured store/model |
| `OPENFGA_MCP_API_TOKEN` | | Pre-shared API token |
| `OPENFGA_MCP_API_CLIENT_ID` | | OAuth client ID |
| `OPENFGA_MCP_API_CLIENT_SECRET` | | OAuth client secret |
| `OPENFGA_MCP_API_ISSUER` | | OAuth token issuer |
| `OPENFGA_MCP_API_AUDIENCE` | | OAuth audience |

When debug logging is enabled, tool calls and transport events are recorded via `withToolLogging()` and the FastMCP logger.

## Features

### Tools (17)

- **Stores:** `create_store`, `delete_store`, `get_store`, `list_stores`
- **Models:** `create_model`, `get_model`, `get_model_dsl`, `list_models`, `verify_model`
- **Permissions:** `check_permission`, `grant_permission`, `revoke_permission`, `list_objects`, `list_users`
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
  server.ts                 # Server bootstrap, transport, lifecycle
  config.ts                 # Environment configuration
  configuration-parser.ts   # JSON config parsing (HTTP ?config= param)
  configurable-http.ts      # Per-request HTTP configuration middleware
  debug-logger.ts           # Debug log file output
  tool-logging.ts           # Tool call logging wrapper
  guards.ts                 # Offline/write/restrict checks
  client.ts                 # OpenFGA client setup
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

## License

Apache-2.0
