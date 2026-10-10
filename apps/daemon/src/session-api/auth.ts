import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { SessionPairRequestV1, SessionPairResponseV1 } from "../../../../packages/protocol/src/index.ts";
import { SessionApiError, type SessionApiContext } from "./service.ts";

export const syntheticSessionIdentities = Object.freeze({
  a: Object.freeze({ principalId: "synthetic-principal-a", workspaceId: "synthetic-workspace-a" }),
  b: Object.freeze({ principalId: "synthetic-principal-b", workspaceId: "synthetic-workspace-b" }),
});
export type SyntheticSessionFixture = keyof typeof syntheticSessionIdentities;
type ClientKind = "browser" | "cli";
interface Ticket { readonly context: SessionApiContext; readonly kind: ClientKind; readonly expires: number }
interface Credential extends Ticket { readonly csrf: string; readonly key: string }
export interface SessionAuthentication { readonly context: SessionApiContext; readonly key: string }
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function equal(a: string, b: string): boolean { const first = Buffer.from(a); const second = Buffer.from(b); return first.length === second.length && timingSafeEqual(first, second); }
function deny(): never { throw new SessionApiError("unauthenticated", "expired_session", 401); }
export class SyntheticSessionAuthenticator {
  readonly #tickets = new Map<string, Ticket>();
  readonly #credentials = new Map<string, Credential>();
  readonly #now: () => number;
  readonly #ttl: number;
  #closed = false;
  constructor(now: () => number = Date.now, sessionTtlMs = 900_000) {
    if (!Number.isSafeInteger(sessionTtlMs) || sessionTtlMs < 1 || sessionTtlMs > 3_600_000) throw new SessionApiError("validation", "invalid_shape", 400);
    this.#now = now; this.#ttl = sessionTtlMs;
  }
  #prune(): void {
    const now = this.#now();
    for (const [key, value] of this.#tickets) if (value.expires <= now) this.#tickets.delete(key);
    for (const [key, value] of this.#credentials) if (value.expires <= now) this.#credentials.delete(key);
  }
  /** Trusted fixture launcher only. No HTTP route can mint a code, select a principal, or grant scope. */
  issuePairingCode(kind: ClientKind, fixture: SyntheticSessionFixture = "a"): string {
    this.#prune();
    if (this.#closed || (kind !== "browser" && kind !== "cli") || !Object.hasOwn(syntheticSessionIdentities, fixture)) deny();
    if (this.#tickets.size >= 8) throw new SessionApiError("budget_exceeded", "rate_limit", 429);
    const code = randomBytes(32).toString("base64url");
    this.#tickets.set(hash(code), { kind, context: syntheticSessionIdentities[fixture], expires: this.#now() + 300_000 }); return code;
  }
  pair(request: SessionPairRequestV1, origin: string | undefined, expectedOrigin: string): Readonly<{ body: SessionPairResponseV1; cookie?: string }> {
    this.#prune(); if (this.#closed) deny();
    const key = hash(request.bootstrapCode); const ticket = this.#tickets.get(key);
    if (!ticket || ticket.kind !== request.clientKind) deny();
    if ((ticket.kind === "browser" && origin !== expectedOrigin) || (ticket.kind === "cli" && origin !== undefined)) throw new SessionApiError("forbidden", "origin_mismatch", 403);
    if (this.#credentials.size >= 32) throw new SessionApiError("budget_exceeded", "rate_limit", 429);
    const credential = `data_${ticket.kind}_${randomBytes(32).toString("base64url")}`; const csrf = randomBytes(32).toString("base64url");
    const expires = this.#now() + this.#ttl; const credentialKey = hash(credential);
    this.#tickets.delete(key); // One-use consumption is synchronous with issuing the credential.
    this.#credentials.set(credentialKey, { ...ticket, expires, csrf, key: credentialKey });
    const common = { schemaVersion: 1 as const, clientKind: ticket.kind, expiresAt: new Date(expires).toISOString() };
    return ticket.kind === "cli" ? { body: { ...common, credential } }
      : { body: { ...common, csrfToken: csrf }, cookie: `zhiwei_data_session=${credential}; HttpOnly; SameSite=Strict; Path=/v1/; Max-Age=${Math.max(1, Math.floor(this.#ttl / 1000))}` };
  }
  authenticate(request: IncomingMessage, expectedOrigin: string): SessionAuthentication {
    this.#prune(); if (this.#closed) deny();
    const authorization = request.headersDistinct.authorization; const cookies = request.headersDistinct.cookie;
    let token: string; let kind: ClientKind;
    if (authorization) {
      if (cookies || request.headersDistinct.origin || authorization.length !== 1 || !/^Bearer data_cli_[A-Za-z0-9_-]{43}$/.test(authorization[0]!)) deny();
      token = authorization[0]!.slice(7); kind = "cli";
    } else {
      if (!cookies || cookies.length !== 1) deny();
      const matches = cookies[0]!.split(";").map(value => value.trim()).filter(value => value.startsWith("zhiwei_data_session="));
      if (matches.length !== 1 || !/^zhiwei_data_session=data_browser_[A-Za-z0-9_-]{43}$/.test(matches[0]!)) deny();
      if (request.headersDistinct.origin?.length !== 1 || request.headersDistinct.origin[0] !== expectedOrigin) throw new SessionApiError("forbidden", "origin_mismatch", 403);
      token = matches[0]!.slice("zhiwei_data_session=".length); kind = "browser";
    }
    const key = hash(token); const entry = this.#credentials.get(key);
    if (!entry || entry.kind !== kind) deny();
    if (kind === "browser" && request.method !== "GET") {
      const csrf = request.headersDistinct["x-zhiwei-csrf"];
      if (!csrf || csrf.length !== 1 || !equal(csrf[0]!, entry.csrf)) throw new SessionApiError("forbidden", "csrf_mismatch", 403);
    }
    return { context: entry.context, key };
  }
  /** Every event is checked again. Revocation/expiry is effective for already-open streams. */
  current(authentication: SessionAuthentication): boolean {
    this.#prune(); const credential = this.#credentials.get(authentication.key);
    return !this.#closed && credential !== undefined && credential.context.principalId === authentication.context.principalId;
  }
  revoke(fixture: SyntheticSessionFixture): void {
    if (!Object.hasOwn(syntheticSessionIdentities, fixture)) deny();
    for (const [key, value] of this.#credentials) if (value.context.principalId === syntheticSessionIdentities[fixture].principalId) this.#credentials.delete(key);
    for (const [key, value] of this.#tickets) if (value.context.principalId === syntheticSessionIdentities[fixture].principalId) this.#tickets.delete(key);
  }
  close(): void { this.#closed = true; this.#credentials.clear(); this.#tickets.clear(); }
}
