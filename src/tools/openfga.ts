import { z } from "zod";
import type { FastMCP } from "fastmcp";
import type { ServerContext } from "../client.js";
import { withToolLogging } from "../tool-logging.js";
import * as storeHandlers from "./handlers/store.js";
import * as relationshipHandlers from "./handlers/relationship.js";
import * as modelHandlers from "./handlers/model.js";

export function registerStoreTools(server: FastMCP, ctx: ServerContext): void {
  server.addTool({
    name: "create_store",
    description: "Create a new OpenFGA store.",
    parameters: z.object({ name: z.string().describe("The name of the store to create") }),
    execute: withToolLogging("create_store", async ({ name }) => storeHandlers.createStore(ctx, name)),
  });

  server.addTool({
    name: "delete_store",
    description: "Delete an OpenFGA store.",
    parameters: z.object({ id: z.string().describe("The ID of the store to delete") }),
    execute: withToolLogging("delete_store", async ({ id }) => storeHandlers.deleteStore(ctx, id)),
  });

  server.addTool({
    name: "get_store",
    description: "Get an OpenFGA store details.",
    parameters: z.object({ id: z.string().describe("The ID of the store to get details for") }),
    execute: withToolLogging("get_store", async ({ id }) => {
      const result = await storeHandlers.getStore(ctx, id);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }),
  });

  server.addTool({
    name: "list_stores",
    description: "List all OpenFGA stores.",
    parameters: z.object({}),
    execute: withToolLogging("list_stores", async () => {
      const result = await storeHandlers.listStores(ctx);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }),
  });
}

export function registerRelationshipTools(server: FastMCP, ctx: ServerContext): void {
  const tupleParams = z.object({
    store: z.string().describe("ID of the store to use"),
    model: z.string().describe("ID of the authorization model to use"),
    user: z.string().describe("ID of the user"),
    relation: z.string().describe("Relation to check"),
    object: z.string().describe("ID of the object"),
  });

  server.addTool({
    name: "check_permission",
    description: 'Check if something has a relation to an object (e.g., can "user:1" read "document:1").',
    parameters: tupleParams,
    execute: withToolLogging("check_permission", async (args) =>
      relationshipHandlers.checkPermission(ctx, args.store, args.model, args.user, args.relation, args.object),
    ),
  });

  server.addTool({
    name: "grant_permission",
    description: "Grant permission to something on an object.",
    parameters: tupleParams,
    execute: withToolLogging("grant_permission", async (args) =>
      relationshipHandlers.grantPermission(ctx, args.store, args.model, args.user, args.relation, args.object),
    ),
  });

  server.addTool({
    name: "revoke_permission",
    description: "Revoke permission from something on an object.",
    parameters: tupleParams,
    execute: withToolLogging("revoke_permission", async (args) =>
      relationshipHandlers.revokePermission(ctx, args.store, args.model, args.user, args.relation, args.object),
    ),
  });

  server.addTool({
    name: "list_objects",
    description: "List objects of a type that something has a relation to.",
    parameters: z.object({
      store: z.string(),
      model: z.string(),
      type: z.string().describe("Type of objects to list"),
      user: z.string(),
      relation: z.string(),
    }),
    execute: withToolLogging("list_objects", async (args) => {
      const result = await relationshipHandlers.listObjects(ctx, args.store, args.model, args.type, args.user, args.relation);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }),
  });

  server.addTool({
    name: "list_users",
    description: "List users that have a given relationship with a given object.",
    parameters: z.object({
      store: z.string(),
      model: z.string(),
      object: z.string(),
      relation: z.string(),
    }),
    execute: withToolLogging("list_users", async (args) => {
      const result = await relationshipHandlers.listUsers(ctx, args.store, args.model, args.object, args.relation);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }),
  });
}

export function registerModelTools(server: FastMCP, ctx: ServerContext): void {
  server.addTool({
    name: "create_model",
    description: "Create a new authorization model using OpenFGA's DSL syntax.",
    parameters: z.object({
      dsl: z.string().describe("DSL representing the authorization model to create"),
      store: z.string().describe("ID of the store to create the authorization model in"),
    }),
    execute: withToolLogging("create_model", async ({ dsl, store }) => modelHandlers.createModel(ctx, dsl, store)),
  });

  server.addTool({
    name: "get_model",
    description: "Get a specific authorization model from a particular store.",
    parameters: z.object({ store: z.string(), model: z.string() }),
    execute: withToolLogging("get_model", async ({ store, model }) => modelHandlers.getModel(ctx, store, model)),
  });

  server.addTool({
    name: "get_model_dsl",
    description: "Get the DSL from a specific authorization model from a particular store.",
    parameters: z.object({ store: z.string(), model: z.string() }),
    execute: withToolLogging("get_model_dsl", async ({ store, model }) => modelHandlers.getModelDsl(ctx, store, model)),
  });

  server.addTool({
    name: "list_models",
    description: "List authorization models in a store, sorted in descending order of creation.",
    parameters: z.object({ store: z.string() }),
    execute: withToolLogging("list_models", async ({ store }) => {
      const result = await modelHandlers.listModels(ctx, store);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }),
  });

  server.addTool({
    name: "verify_model",
    description: "Verify a DSL representation of an authorization model.",
    parameters: z.object({ dsl: z.string() }),
    execute: withToolLogging("verify_model", async ({ dsl }) => modelHandlers.verifyModel(ctx, dsl)),
  });
}
