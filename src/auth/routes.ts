import type { FastMCP } from "fastmcp";
import type { ServerContext } from "../client.js";
import { buildServerAuth } from "../fga-config.js";
import { validateOpenFgaAuth } from "../auth-probe.js";
import { notifyElicitationComplete } from "../elicitation/request-url-elicitation.js";
import { renderElicitForm, renderErrorPage, renderSuccessPage } from "./templates.js";

function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

export function registerAuthRoutes(server: FastMCP, ctx: ServerContext): void {
  const app = server.getApp();

  app.get("/auth/elicit/:elicitationId", (c) => {
    const elicitationId = c.req.param("elicitationId");
    const pending = ctx.pendingElicitations.get(elicitationId);
    if (!pending || pending.status !== "pending") {
      return c.html(renderErrorPage("This authentication request is invalid or has expired."), 400);
    }
    return c.html(renderElicitForm(pending));
  });

  app.post("/auth/elicit/:elicitationId", async (c) => {
    const elicitationId = c.req.param("elicitationId");
    const pending = ctx.pendingElicitations.get(elicitationId);
    if (!pending || pending.status !== "pending") {
      return c.html(renderErrorPage("This authentication request is invalid or has expired."), 400);
    }

    const body = await c.req.text();
    const form = parseFormBody(body);
    if (form.csrf !== pending.csrfToken) {
      return c.html(renderErrorPage("Invalid form submission."), 403);
    }

    let auth;
    try {
      if (form.method === "api_token") {
        auth = buildServerAuth({ apiToken: form.token });
      } else if (form.method === "client_credentials") {
        auth = buildServerAuth({
          clientId: form.client_id,
          clientSecret: form.client_secret,
          issuer: form.issuer,
          audience: form.audience,
          scopes: form.scopes,
        });
      } else {
        return c.html(renderErrorPage("Select a valid authentication method."), 400);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.html(renderErrorPage(message), 400);
    }

    if (!auth) {
      return c.html(renderErrorPage("Credentials are required."), 400);
    }

    const valid = await validateOpenFgaAuth(pending.apiUrl, auth);
    if (!valid) {
      return c.html(renderErrorPage("Credentials were rejected by the OpenFGA server."), 401);
    }

    ctx.pendingElicitations.complete(elicitationId, auth);
    await notifyElicitationComplete(pending.sessionId, elicitationId);
    return c.html(renderSuccessPage());
  });
}
