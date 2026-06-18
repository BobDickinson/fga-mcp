import type { ServerContext } from "./client.js";
import { probeOpenFgaAuth } from "./auth-probe.js";
import { isDynamicConnectionsEnabled, requireScopeStore } from "./connection-resolver.js";
import type { ConnectServerInput, ConnectServerResult } from "./dynamic-scope-store.js";
import type { FgaServerConfig } from "./fga-config.js";
import { requestUrlElicitation } from "./elicitation/request-url-elicitation.js";
import type { ToolCallContext } from "./elicitation/types.js";
import { requirePool } from "./client.js";

export type ConnectServerToolInput = {
  connection_scope?: string;
  requested_name?: string;
  api_url?: string;
  server?: string;
  label?: string;
  default_store?: string;
  default_model?: string;
  restrict?: boolean;
  writeable?: boolean;
};

function connectMessage(reason: "connect" | "reauth", apiUrl: string): string {
  return reason === "reauth"
    ? `OpenFGA credentials expired or were rejected for ${apiUrl}. Authenticate to continue.`
    : `Authenticate to connect to OpenFGA at ${apiUrl}.`;
}

export async function executeConnectServer(
  ctx: ServerContext,
  input: ConnectServerToolInput,
  toolCtx?: ToolCallContext,
): Promise<ConnectServerResult> {
  const apiUrlInput = input.api_url?.trim();
  const serverInput = input.server?.trim();
  const hasApiUrl = Boolean(apiUrlInput);
  const hasServer = Boolean(serverInput);

  if (hasApiUrl === hasServer) {
    throw new Error("connect_server requires exactly one of api_url or server.");
  }

  if (hasApiUrl) {
    if (!isDynamicConnectionsEnabled(ctx)) {
      throw new Error(
        "Dynamic connections are disabled. Set allow_dynamic_connections: true in FGA config to connect arbitrary api_url backends.",
      );
    }
    return connectDynamicApiUrl(ctx, input, toolCtx);
  }

  return connectFixedScoped(ctx, serverInput!, input, toolCtx);
}

async function connectDynamicApiUrl(
  ctx: ServerContext,
  input: ConnectServerToolInput,
  toolCtx?: ToolCallContext,
): Promise<ConnectServerResult> {
  const apiUrl = input.api_url!.trim();
  const store = requireScopeStore(ctx);
  const scopeId = input.connection_scope?.trim();

  const completed = ctx.pendingElicitations.findCompletedForConnect({
    connectMode: "api_url",
    apiUrl,
    connectionScope: scopeId,
  });

  if (completed?.auth) {
    return store.connectServer(buildConnectPayload(input, apiUrl, completed.auth, false));
  }

  const probe = await probeOpenFgaAuth(apiUrl);
  if (probe.status === "error") {
    throw new Error(probe.message);
  }

  if (probe.status === "auth_required") {
    requestUrlElicitation({
      ctx,
      pendingStore: ctx.pendingElicitations,
      reason: "connect",
      connectMode: "api_url",
      apiUrl,
      message: connectMessage("connect", apiUrl),
      connectionScope: scopeId,
      requestedName: input.requested_name,
      policyHints: policyHintsFromInput(input),
      toolCtx,
    });
  }

  return store.connectServer(buildConnectPayload(input, apiUrl, undefined, false));
}

async function connectFixedScoped(
  ctx: ServerContext,
  serverName: string,
  input: ConnectServerToolInput,
  toolCtx?: ToolCallContext,
): Promise<ConnectServerResult> {
  const pool = requirePool(ctx);
  const entry = pool.servers.get(serverName);
  if (!entry) {
    throw new Error(`Unknown fixed server "${serverName}".`);
  }

  if (entry.profile.auth) {
    throw new Error(
      `Server "${serverName}" uses configured credentials. Omit connection_scope and call FGA tools with server only.`,
    );
  }

  if (!ctx.connectRequiredServers.has(serverName) && ctx.transport === "http") {
    const probe = await probeOpenFgaAuth(entry.profile.api_url);
    if (probe.status === "open") {
      throw new Error(
        `Server "${serverName}" does not require connect_server. Use fixed direct routing with server only.`,
      );
    }
    if (probe.status === "auth_required") {
      ctx.connectRequiredServers.add(serverName);
    } else if (probe.status === "error") {
      throw new Error(probe.message);
    }
  }

  if (!ctx.connectRequiredServers.has(serverName)) {
    throw new Error(
      `Server "${serverName}" does not require connect_server. Use fixed direct routing with server only.`,
    );
  }

  const store = requireScopeStore(ctx);
  const apiUrl = entry.profile.api_url;
  const scopeId = input.connection_scope?.trim();

  const completed = ctx.pendingElicitations.findCompletedForConnect({
    connectMode: "server",
    apiUrl,
    server: serverName,
    connectionScope: scopeId,
  });

  if (completed?.auth) {
    return store.connectServer(
      buildFixedScopedPayload(serverName, entry.profile, input, completed.auth, scopeId),
    );
  }

  const probe = await probeOpenFgaAuth(apiUrl);
  if (probe.status === "error") {
    throw new Error(probe.message);
  }

  if (probe.status === "auth_required") {
    requestUrlElicitation({
      ctx,
      pendingStore: ctx.pendingElicitations,
      reason: "connect",
      connectMode: "server",
      apiUrl,
      server: serverName,
      message: connectMessage("connect", apiUrl),
      connectionScope: scopeId,
      fixedFromConfig: true,
      policyHints: policyHintsFromProfile(entry.profile, input),
      toolCtx,
    });
  }

  return store.connectServer(buildFixedScopedPayload(serverName, entry.profile, input, undefined, scopeId));
}

function buildConnectPayload(
  input: ConnectServerToolInput,
  apiUrl: string,
  auth: ConnectServerInput["auth"],
  fixedFromConfig: boolean,
): ConnectServerInput {
  return {
    connectionScope: input.connection_scope,
    requestedName: input.requested_name,
    apiUrl,
    auth,
    label: input.label,
    defaultStore: input.default_store,
    defaultModel: input.default_model,
    restrict: input.restrict,
    writeable: input.writeable,
    fixedFromConfig,
  };
}

function buildFixedScopedPayload(
  serverName: string,
  profile: FgaServerConfig,
  input: ConnectServerToolInput,
  auth: ConnectServerInput["auth"],
  connectionScope?: string,
): ConnectServerInput {
  return {
    connectionScope: connectionScope,
    apiUrl: profile.api_url,
    auth,
    label: input.label ?? profile.label,
    defaultStore: input.default_store ?? profile.default_store,
    defaultModel: input.default_model ?? profile.default_model,
    restrict: input.restrict ?? profile.restrict,
    writeable: input.writeable ?? profile.writeable,
    fixedFromConfig: true,
    serverName,
  };
}

function policyHintsFromInput(input: ConnectServerToolInput) {
  return {
    restrict: input.restrict,
    writeable: input.writeable,
    defaultStore: input.default_store,
    defaultModel: input.default_model,
  };
}

function policyHintsFromProfile(profile: FgaServerConfig, input: ConnectServerToolInput) {
  return {
    restrict: input.restrict ?? profile.restrict,
    writeable: input.writeable ?? profile.writeable,
    defaultStore: input.default_store ?? profile.default_store,
    defaultModel: input.default_model ?? profile.default_model,
  };
}

export function throwReauthElicitation(
  ctx: ServerContext,
  options: {
    apiUrl: string;
    server: string;
    connectionScope: string;
    toolCtx?: ToolCallContext;
  },
): never {
  requestUrlElicitation({
    ctx,
    pendingStore: ctx.pendingElicitations,
    reason: "reauth",
    connectMode: "server",
    apiUrl: options.apiUrl,
    server: options.server,
    message: connectMessage("reauth", options.apiUrl),
    connectionScope: options.connectionScope,
    toolCtx: options.toolCtx,
  });
}
