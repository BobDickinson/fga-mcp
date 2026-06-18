import { randomBytes, randomUUID } from "node:crypto";
import type { ServerAuth } from "../fga-config.js";
import type { ConnectMode, ElicitationReason, PendingElicitation } from "./types.js";

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export type CreatePendingInput = {
  reason: ElicitationReason;
  connectMode: ConnectMode;
  apiUrl: string;
  connectionScope?: string;
  server?: string;
  requestedName?: string;
  fixedFromConfig?: boolean;
  sessionId?: string;
  policyHints?: PendingElicitation["policyHints"];
  ttlMs?: number;
};

export type ConnectMatchInput = {
  connectMode: ConnectMode;
  apiUrl: string;
  server?: string;
  connectionScope?: string;
};

export class PendingElicitationStore {
  private records = new Map<string, PendingElicitation>();

  create(input: CreatePendingInput): PendingElicitation {
    const now = Date.now();
    const record: PendingElicitation = {
      elicitationId: randomUUID(),
      reason: input.reason,
      connectMode: input.connectMode,
      apiUrl: input.apiUrl.trim(),
      connectionScope: input.connectionScope?.trim() || undefined,
      server: input.server?.trim() || undefined,
      requestedName: input.requestedName?.trim() || undefined,
      fixedFromConfig: input.fixedFromConfig,
      csrfToken: randomBytes(32).toString("hex"),
      policyHints: input.policyHints,
      createdAt: now,
      expiresAt: now + (input.ttlMs ?? DEFAULT_TTL_MS),
      status: "pending",
      sessionId: input.sessionId,
    };
    this.records.set(record.elicitationId, record);
    return record;
  }

  get(elicitationId: string): PendingElicitation | undefined {
    const record = this.records.get(elicitationId);
    if (!record) return undefined;
    if (record.status === "pending" && Date.now() > record.expiresAt) {
      record.status = "cancelled";
    }
    return record;
  }

  complete(elicitationId: string, auth: ServerAuth): PendingElicitation | undefined {
    const record = this.get(elicitationId);
    if (!record || record.status !== "pending") return undefined;
    record.status = "completed";
    record.auth = auth;
    return record;
  }

  cancel(elicitationId: string): void {
    const record = this.records.get(elicitationId);
    if (record) record.status = "cancelled";
  }

  findCompletedForConnect(input: ConnectMatchInput): PendingElicitation | undefined {
    const normalizedUrl = normalizeApiUrl(input.apiUrl);
    let best: PendingElicitation | undefined;

    for (const record of this.records.values()) {
      if (record.status !== "completed" || record.reason !== "connect" || !record.auth) continue;
      if (record.connectionScope && input.connectionScope && record.connectionScope !== input.connectionScope) {
        continue;
      }
      if (input.connectMode === "server") {
        if (record.connectMode !== "server" || record.server !== input.server) continue;
      } else if (normalizeApiUrl(record.apiUrl) !== normalizedUrl) {
        continue;
      }
      if (!best || record.createdAt > best.createdAt) best = record;
    }

    if (best) {
      this.records.delete(best.elicitationId);
    }
    return best;
  }

  findCompletedForReauth(connectionScope: string, server: string): PendingElicitation | undefined {
    let best: PendingElicitation | undefined;
    for (const record of this.records.values()) {
      if (record.status !== "completed" || record.reason !== "reauth" || !record.auth) continue;
      if (record.connectionScope !== connectionScope || record.server !== server) continue;
      if (!best || record.createdAt > best.createdAt) best = record;
    }
    if (best) this.records.delete(best.elicitationId);
    return best;
  }

  createReauth(input: Omit<CreatePendingInput, "reason" | "connectMode"> & { server: string }): PendingElicitation {
    return this.create({
      ...input,
      reason: "reauth",
      connectMode: "server",
      server: input.server,
    });
  }

  purgeExpired(): void {
    const now = Date.now();
    for (const [id, record] of this.records.entries()) {
      if (record.status === "pending" && now > record.expiresAt) {
        this.records.delete(id);
      }
    }
  }
}

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.trim().replace(/\/+$/, "").toLowerCase();
}
