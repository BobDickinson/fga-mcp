import { checkOfflineMode } from "../../guards.js";
import { requirePool, type ServerContext } from "../../client.js";
import { listFixedServers, setDefaultServer } from "../../server-pool.js";

export async function listServers(ctx: ServerContext): Promise<string | Record<string, unknown>> {
  const offline = checkOfflineMode(ctx, "Listing FGA servers");
  if (offline) return offline;

  try {
    const pool = requirePool(ctx);
    return { servers: listFixedServers(pool) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `❌ Failed to list servers! Error: ${message}`;
  }
}

export async function setDefaultServerTool(ctx: ServerContext, server: string): Promise<string> {
  const offline = checkOfflineMode(ctx, "Setting default server");
  if (offline) return offline;

  try {
    const pool = requirePool(ctx);
    setDefaultServer(pool, server);
    return `✅ Default server set to "${server}".`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `❌ Failed to set default server! Error: ${message}`;
  }
}
