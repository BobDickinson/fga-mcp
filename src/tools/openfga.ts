import { z } from "zod";
import type { FastMCP } from "fastmcp";
import type { ServerContext } from "../client.js";
import { withToolLogging } from "../tool-logging.js";
import * as storeHandlers from "./handlers/store.js";
import * as relationshipHandlers from "./handlers/relationship.js";
import * as modelHandlers from "./handlers/model.js";
import * as serverHandlers from "./handlers/server-management.js";

const ROUTING_HINT =
  " Omit connection_scope for fixed servers unless list_servers shows auth_status connect_required. When connect_required, or for dynamic servers, call connect_server first and pass connection_scope on every FGA tool.";

const connectionScopeParam = z
  .string()
  .optional()
  .describe(
    "Application session UUID returned by connect_server. Required on HTTP for scoped servers. Omit for fixed direct servers (no auth_status connect_required on list_servers). Not used for documentation tools or verify_model.",
  );

const connectionScopeForListParam = connectionScopeParam.describe(
  "Optional. When provided, dynamic servers for that scope are appended to servers (fixed: false). Fixed servers are always included.",
);

const connectionScopeConnectParam = connectionScopeParam.describe(
  "Existing scope UUID to add or reconnect within. Omit on first connect to mint a new scope.",
);

const serverParam = z
  .string()
  .optional()
  .describe(
    "Server name within the resolved pool. Fixed names from unscoped list_servers; dynamic names are assigned by connect_server (authoritative — may differ from requested_name if renamed). Omit to use the default server in that pool.",
  );

const defaultServerParam = z
  .string()
  .describe("Server name to use as default when server is omitted. Must appear in list_servers for the fixed pool or the given connection_scope.");

const storeParam = z
  .string()
  .optional()
  .describe(
    "OpenFGA store ID on the resolved server. Optional when the server has default_store configured. Required when restrict: true pins a store.",
  );

const modelParam = z
  .string()
  .optional()
  .describe(
    'Authorization model ID on the resolved store. Optional when the server has default_model configured or when using "latest". Required when restrict: true pins a model.',
  );

const routingParams = {
  connection_scope: connectionScopeParam,
  server: serverParam,
};

export function registerServerManagementTools(server: FastMCP, ctx: ServerContext): void {
  server.addTool({
    name: "list_servers",
    description:
      "Discover FGA backends. Call this first. Returns dynamic_connections_enabled and fixed servers (fixed: true). auth_status connect_required appears only when connect_server({ server }) is needed; omit connection_scope for other fixed servers. With connection_scope, lists scoped entries and connected status.",
    parameters: z.object({
      connection_scope: connectionScopeForListParam,
    }),
    execute: withToolLogging("list_servers", async ({ connection_scope }) => {
      const result = await serverHandlers.listServers(ctx, connection_scope);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }),
  });

  server.addTool({
    name: "set_default_server",
    description:
      "Change which server is used when server is omitted. Without connection_scope: fixed pool only. With connection_scope: default within that dynamic scope.",
    parameters: z.object({
      ...routingParams,
      server: defaultServerParam,
    }),
    execute: withToolLogging("set_default_server", async ({ server: serverRef, connection_scope }) =>
      serverHandlers.setDefaultServerTool(ctx, serverRef, connection_scope),
    ),
  });

  server.addTool({
    name: "connect_server",
    description:
      "Connect to an FGA backend and obtain connection_scope. Two modes: (1) Fixed auth — pass server (config name) when list_servers reports auth_status connect_required; allowed regardless of dynamic_connections_enabled. (2) Dynamic — pass api_url when dynamic_connections_enabled is true. First call without connection_scope mints a scope. Returns connection_scope and server; pass both on subsequent admin and relationship tools. Reconnecting same target within a scope upserts credentials.",
    parameters: z.object({
      connection_scope: connectionScopeConnectParam,
      requested_name: z
        .string()
        .optional()
        .describe(
          "Optional name hint (e.g. staging). Server assigns the actual server name; may suffix on collision (dev to dev-1) or derive from URL host if omitted.",
        ),
      api_url: z.string().describe("OpenFGA HTTP API URL (required)."),
      api_token: z
        .string()
        .optional()
        .describe("API token authentication. If set, used instead of OAuth client credentials."),
      client_id: z.string().optional().describe("OAuth client ID. Required with client_secret, issuer, and audience when not using api_token."),
      client_secret: z.string().optional().describe("OAuth client secret."),
      issuer: z.string().optional().describe("OAuth token issuer URL."),
      audience: z.string().optional().describe("OAuth API audience."),
      scopes: z
        .string()
        .optional()
        .describe("Optional space-separated OAuth scopes for client credentials."),
      label: z.string().optional().describe("Optional display label for this connection."),
      default_store: z
        .string()
        .optional()
        .describe("Optional default store ID for this dynamic server when tool args omit store."),
      default_model: z
        .string()
        .optional()
        .describe("Optional default model ID for this dynamic server when tool args omit model."),
      restrict: z
        .boolean()
        .optional()
        .describe(
          "If true, only pinned default_store and default_model are allowed. Default inherits from FGA config defaults.restrict.",
        ),
      writeable: z
        .boolean()
        .optional()
        .describe(
          "If true, allow mutations (create/delete stores, models, tuples). Default false unless inherited from defaults.writeable.",
        ),
    }),
    execute: withToolLogging("connect_server", async (args) => {
      const result = await serverHandlers.connectServer(ctx, args);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }),
  });

  server.addTool({
    name: "disconnect_server",
    description:
      "Disconnect a dynamic FGA server from a connection scope. Removing the last server in a scope deletes the scope; the next connect_server without connection_scope mints a new UUID.",
    parameters: z.object({
      connection_scope: z.string().describe("Dynamic connection scope UUID from connect_server."),
      server: z.string().describe("Assigned server name from connect_server (not requested_name if they differ)."),
    }),
    execute: withToolLogging("disconnect_server", async ({ connection_scope, server: serverRef }) =>
      serverHandlers.disconnectServer(ctx, connection_scope, serverRef),
    ),
  });
}

export function registerStoreTools(server: FastMCP, ctx: ServerContext): void {
  server.addTool({
    name: "create_store",
    description: `Create a new OpenFGA store. Requires writeable: true on the target server.${ROUTING_HINT}`,
    parameters: z.object({
      name: z.string().describe("Display name for the new store (not unique; use returned store ID for later calls)."),
      ...routingParams,
    }),
    execute: withToolLogging("create_store", async ({ name, server, connection_scope }) =>
      storeHandlers.createStore(ctx, name, server, connection_scope),
    ),
  });

  server.addTool({
    name: "delete_store",
    description: `Delete an OpenFGA store. Requires writeable: true on the target server. restrict may block non-pinned stores.${ROUTING_HINT}`,
    parameters: z.object({
      id: z.string().describe("Store ID to delete."),
      ...routingParams,
    }),
    execute: withToolLogging("delete_store", async ({ id, server, connection_scope }) =>
      storeHandlers.deleteStore(ctx, id, server, connection_scope),
    ),
  });

  server.addTool({
    name: "get_store",
    description: `Get OpenFGA store details by ID. restrict may reject stores other than the pinned default_store.${ROUTING_HINT}`,
    parameters: z.object({
      id: z.string().describe("Store ID to fetch."),
      ...routingParams,
    }),
    execute: withToolLogging("get_store", async ({ id, server, connection_scope }) => {
      const result = await storeHandlers.getStore(ctx, id, server, connection_scope);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }),
  });

  server.addTool({
    name: "list_stores",
    description: `List OpenFGA stores on a FGA server. Use list_servers first for auth_status and dynamic_connections_enabled.${ROUTING_HINT}`,
    parameters: z.object({ ...routingParams }),
    execute: withToolLogging("list_stores", async ({ server, connection_scope }) => {
      const result = await storeHandlers.listStores(ctx, server, connection_scope);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }),
  });
}

export function registerRelationshipTools(server: FastMCP, ctx: ServerContext): void {
  const tupleParams = z.object({
    ...routingParams,
    store: storeParam,
    model: modelParam,
    user: z.string().describe("Subject in OpenFGA format, e.g. user:alice or group:eng#member."),
    relation: z.string().describe("Relation name from the authorization model, e.g. reader or writer."),
    object: z.string().describe("Object in OpenFGA format, e.g. document:budget."),
  });

  server.addTool({
    name: "check_permission",
    description: `Check if a subject has a relation on an object (OpenFGA Check). Read-only. store and model optional when server defaults are configured.${ROUTING_HINT}`,
    parameters: tupleParams,
    execute: withToolLogging("check_permission", async (args) =>
      relationshipHandlers.checkPermission(
        ctx,
        args.store,
        args.model,
        args.user,
        args.relation,
        args.object,
        args.server,
        args.connection_scope,
      ),
    ),
  });

  server.addTool({
    name: "grant_permission",
    description: `Write a relationship tuple (grant permission). Requires writeable: true on the target server.${ROUTING_HINT}`,
    parameters: tupleParams,
    execute: withToolLogging("grant_permission", async (args) =>
      relationshipHandlers.grantPermission(
        ctx,
        args.store,
        args.model,
        args.user,
        args.relation,
        args.object,
        args.server,
        args.connection_scope,
      ),
    ),
  });

  server.addTool({
    name: "revoke_permission",
    description: `Delete a relationship tuple (revoke permission). Requires writeable: true on the target server.${ROUTING_HINT}`,
    parameters: tupleParams,
    execute: withToolLogging("revoke_permission", async (args) =>
      relationshipHandlers.revokePermission(
        ctx,
        args.store,
        args.model,
        args.user,
        args.relation,
        args.object,
        args.server,
        args.connection_scope,
      ),
    ),
  });

  server.addTool({
    name: "list_objects",
    description: `List objects of a type a user can access via a relation (OpenFGA ListObjects). store and model optional when server defaults are configured.${ROUTING_HINT}`,
    parameters: z.object({
      ...routingParams,
      store: storeParam,
      model: modelParam,
      type: z.string().describe("Object type prefix to list, e.g. document for document:* objects."),
      user: z.string().describe("Subject in OpenFGA format, e.g. user:alice."),
      relation: z.string().describe("Relation name, e.g. reader."),
    }),
    execute: withToolLogging("list_objects", async (args) => {
      const result = await relationshipHandlers.listObjects(
        ctx,
        args.store,
        args.model,
        args.type,
        args.user,
        args.relation,
        args.server,
        args.connection_scope,
      );
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }),
  });

  server.addTool({
    name: "list_users",
    description: `List users or subjects with a relation on an object (OpenFGA ListUsers). store and model optional when server defaults are configured.${ROUTING_HINT}`,
    parameters: z.object({
      ...routingParams,
      store: storeParam,
      model: modelParam,
      object: z.string().describe("Object in OpenFGA format, e.g. document:budget."),
      relation: z.string().describe("Relation name, e.g. reader."),
    }),
    execute: withToolLogging("list_users", async (args) => {
      const result = await relationshipHandlers.listUsers(
        ctx,
        args.store,
        args.model,
        args.object,
        args.relation,
        args.server,
        args.connection_scope,
      );
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }),
  });
}

export function registerModelTools(server: FastMCP, ctx: ServerContext): void {
  server.addTool({
    name: "create_model",
    description: `Create an authorization model from OpenFGA DSL. Requires writeable: true on the target server.${ROUTING_HINT}`,
    parameters: z.object({
      dsl: z.string().describe("OpenFGA authorization model DSL (schema 1.1)."),
      store: storeParam.describe("Store ID to write the model to. Required unless server default_store is configured."),
      ...routingParams,
    }),
    execute: withToolLogging("create_model", async ({ dsl, store, server, connection_scope }) =>
      modelHandlers.createModel(ctx, dsl, store, server, connection_scope),
    ),
  });

  server.addTool({
    name: "get_model",
    description: `Get authorization model metadata from a store.${ROUTING_HINT}`,
    parameters: z.object({ ...routingParams, store: storeParam, model: modelParam }),
    execute: withToolLogging("get_model", async ({ store, model, server, connection_scope }) =>
      modelHandlers.getModel(ctx, store, model, server, connection_scope),
    ),
  });

  server.addTool({
    name: "get_model_dsl",
    description: `Get authorization model as OpenFGA DSL text.${ROUTING_HINT}`,
    parameters: z.object({ ...routingParams, store: storeParam, model: modelParam }),
    execute: withToolLogging("get_model_dsl", async ({ store, model, server, connection_scope }) =>
      modelHandlers.getModelDsl(ctx, store, model, server, connection_scope),
    ),
  });

  server.addTool({
    name: "list_models",
    description: `List authorization models in a store, newest first.${ROUTING_HINT}`,
    parameters: z.object({ ...routingParams, store: storeParam }),
    execute: withToolLogging("list_models", async ({ store, server, connection_scope }) => {
      const result = await modelHandlers.listModels(ctx, store, server, connection_scope);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }),
  });

  server.addTool({
    name: "verify_model",
    description:
      "Validate OpenFGA DSL locally. Does not contact OpenFGA; ignores connection_scope, server, store, and model. Works offline.",
    parameters: z.object({
      dsl: z.string().describe("OpenFGA authorization model DSL (schema 1.1) to validate."),
    }),
    execute: withToolLogging("verify_model", async ({ dsl }) => modelHandlers.verifyModel(ctx, dsl)),
  });
}
