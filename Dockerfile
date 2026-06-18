# Build stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY patches ./patches
COPY scripts ./scripts
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY docs ./docs

RUN npm run build
RUN npm prune --omit=dev

# Runtime stage
FROM node:22-bookworm-slim

RUN groupadd --gid 1000 mcp && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin mcp

WORKDIR /app

COPY --from=builder --chown=mcp:mcp /app/dist ./dist
COPY --from=builder --chown=mcp:mcp /app/node_modules ./node_modules
COPY --from=builder --chown=mcp:mcp /app/package.json ./
COPY --from=builder --chown=mcp:mcp /app/docs ./docs

USER mcp

ENV OPENFGA_MCP_TRANSPORT=stdio \
    OPENFGA_MCP_TRANSPORT_HOST=0.0.0.0 \
    OPENFGA_MCP_TRANSPORT_PORT=9090 \
    OPENFGA_MCP_API_WRITEABLE=false \
    OPENFGA_MCP_API_RESTRICT=false

EXPOSE 9090

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD if [ "$OPENFGA_MCP_TRANSPORT" = "http" ]; then \
            node -e "fetch('http://localhost:' + (process.env.OPENFGA_MCP_TRANSPORT_PORT || '9090') + '/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; \
        else \
            exit 0; \
        fi

ENTRYPOINT ["node", "dist/index.js"]
