import {
  CredentialsMethod,
  OpenFgaClient,
  type OpenFgaClient as OpenFgaClientType,
} from "@openfga/sdk";
import { getConfiguredString, isOfflineMode } from "./config.js";

export type ServerContext = {
  client: OpenFgaClientType | null;
  offline: boolean;
};

export async function createServerContext(): Promise<ServerContext> {
  if (isOfflineMode()) {
    logInfo("Starting OpenFGA MCP Server in OFFLINE MODE");
    logInfo("Available features: Planning (Prompts) and Coding assistance");
    logInfo("To enable administrative features, configure OPENFGA_MCP_API_URL\n");
    return { client: null, offline: true };
  }

  const apiUrl = getConfiguredString("OPENFGA_MCP_API_URL", "");
  const token = getConfiguredString("OPENFGA_MCP_API_TOKEN", "");
  const clientId = getConfiguredString("OPENFGA_MCP_API_CLIENT_ID", "");
  const clientSecret = getConfiguredString("OPENFGA_MCP_API_CLIENT_SECRET", "");
  const issuer = getConfiguredString("OPENFGA_MCP_API_ISSUER", "");
  const audience = getConfiguredString("OPENFGA_MCP_API_AUDIENCE", "");
  const finalUrl = apiUrl !== "" ? apiUrl : "http://127.0.0.1:8080";

  let credentials: ConstructorParameters<typeof OpenFgaClient>[0]["credentials"];

  if (token !== "") {
    credentials = {
      method: CredentialsMethod.ApiToken,
      config: { token, headerName: "Authorization", headerValuePrefix: "Bearer" },
    };
  } else if (clientId !== "") {
    credentials = {
      method: CredentialsMethod.ClientCredentials,
      config: { clientId, clientSecret, apiTokenIssuer: issuer, apiAudience: audience },
    };
  }

  const client = new OpenFgaClient({ apiUrl: finalUrl, credentials });

  try {
    await client.listStores({ pageSize: 1 });
  } catch (connectionError) {
    const message = connectionError instanceof Error ? connectionError.message : String(connectionError);
    logWarning(`Could not validate OpenFGA connection: ${message}`);
    logWarning("The server will start but operations may fail.");
    logWarning("Please verify your OPENFGA_MCP_API_URL and authentication settings.\n");
  }

  logInfo("Starting OpenFGA MCP Server in ONLINE MODE");
  logInfo(`Connected to: ${finalUrl}`);
  logInfo("All features enabled: Planning, Coding, and Administrative\n");

  return { client, offline: false };
}

export function requireClient(ctx: ServerContext): OpenFgaClientType {
  if (!ctx.client) {
    throw new Error("OpenFGA client is not available in offline mode");
  }
  return ctx.client;
}

function logInfo(message: string): void {
  process.stderr.write(`[INFO] ${message}\n`);
}

function logWarning(message: string): void {
  process.stderr.write(`[WARNING] ${message}\n`);
}
