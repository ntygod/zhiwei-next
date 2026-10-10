import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { SessionApiError, type SessionApiContext } from "./service.ts";
interface CursorBinding extends SessionApiContext { readonly purpose: "events" | "tasks"; readonly filter?: string }
export interface CursorPosition { readonly commitCursor: number; readonly after?: string }
interface CursorKey { readonly id: string; readonly secret: Buffer; readonly nonces: Set<string>; count: number }
export interface SessionCursorOptions {
  readonly installationId: string;
  readonly recoveryEpoch: () => string;
  readonly projectionGeneration: () => number;
  readonly now?: () => number;
  readonly random?: (size: number) => Buffer;
  readonly ttlMs?: number;
  readonly maxTokensPerKey?: number;
  readonly maxNamespaces?: number;
}
function expired(): never { throw new SessionApiError("unavailable", "cursor_expired", 410); }
/** Process-local keys. Neither keys nor commit positions are written into credentials/logs/backups. */
export class SessionCursorCodec {
  readonly #keys = new Map<string, CursorKey>();
  readonly #options: SessionCursorOptions;
  readonly #now: () => number;
  readonly #random: (size: number) => Buffer;
  readonly #ttl: number;
  readonly #maximum: number;
  readonly #namespaces: number;
  #closed = false;
  constructor(options: SessionCursorOptions) {
    this.#options = options; this.#now = options.now ?? Date.now; this.#random = options.random ?? randomBytes;
    this.#ttl = options.ttlMs ?? 300_000; this.#maximum = options.maxTokensPerKey ?? 100_000; this.#namespaces = options.maxNamespaces ?? 64;
    if (!options.installationId || !Number.isSafeInteger(this.#ttl) || this.#ttl < 1 || this.#ttl > 300_000
      || !Number.isSafeInteger(this.#maximum) || this.#maximum < 1 || this.#maximum > 100_000
      || !Number.isSafeInteger(this.#namespaces) || this.#namespaces < 1 || this.#namespaces > 64) throw new SessionApiError("validation", "invalid_shape", 400);
  }
  #namespace(binding: CursorBinding): string { return createHash("sha256").update(JSON.stringify([binding.principalId, binding.workspaceId, binding.purpose, binding.filter ?? ""])).digest("hex"); }
  #bytes(size: number): Buffer {
    const value = this.#random(size);
    if (!Buffer.isBuffer(value) || value.byteLength !== size) throw new Error("random source unavailable");
    return Buffer.from(value);
  }
  #drop(namespace: string): void { this.#keys.get(namespace)?.secret.fill(0); this.#keys.delete(namespace); }
  #key(namespace: string): CursorKey {
    let key = this.#keys.get(namespace);
    if (key && key.count >= this.#maximum) { this.#drop(namespace); key = undefined; }
    if (!key) {
      while (this.#keys.size >= this.#namespaces) this.#drop(this.#keys.keys().next().value!);
      key = { id: this.#bytes(16).toString("base64url"), secret: this.#bytes(32), nonces: new Set(), count: 0 };
      this.#keys.set(namespace, key);
    }
    return key;
  }
  encode(binding: CursorBinding, position: CursorPosition): string {
    try {
      if (this.#closed || !Number.isSafeInteger(position.commitCursor) || position.commitCursor < 0
        || (position.after !== undefined && (typeof position.after !== "string" || position.after.length > 256))) throw new Error("invalid cursor position");
      const now = this.#now(); const generation = this.#options.projectionGeneration();
      if (!Number.isSafeInteger(now) || !Number.isSafeInteger(generation) || generation < 0) throw new Error("invalid clock or generation");
      const scopeSelectionHash = this.#namespace(binding); const key = this.#key(scopeSelectionHash);
      let nonce: Buffer | undefined;
      for (let attempt = 0; attempt < 4; attempt++) {
        const candidate = this.#bytes(12); const serialized = candidate.toString("base64url");
        if (!key.nonces.has(serialized)) { key.nonces.add(serialized); nonce = candidate; break; }
      }
      if (!nonce) throw new Error("nonce collision");
      key.count++;
      const header = `v1.${key.id}`;
      const cipher = createCipheriv("aes-256-gcm", key.secret, nonce); cipher.setAAD(Buffer.from(header));
      const payload = { installationId: this.#options.installationId, recoveryEpoch: this.#options.recoveryEpoch(), principalId: binding.principalId,
        scopeSelectionHash, projectionGeneration: generation, commitCursor: position.commitCursor, expiry: now + this.#ttl, ...(position.after === undefined ? {} : { after: position.after }) };
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
      return Buffer.from(`${header}.${nonce.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`, "ascii").toString("base64url");
    } catch { throw new SessionApiError("unavailable", "dependency_down", 503); }
  }
  decode(binding: CursorBinding, token: string): CursorPosition {
    try {
      if (this.#closed || typeof token !== "string" || token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(token)) expired();
      const envelope = Buffer.from(token, "base64url"); if (envelope.toString("base64url") !== token) expired();
      const encoded = envelope.toString("utf8"); if (!/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(encoded)) expired();
      const [format, id, nonceText, ciphertextText, tagText] = encoded.split(".") as [string, string, string, string, string];
      const namespace = this.#namespace(binding); const key = this.#keys.get(namespace);
      if (!key || key.id !== id) expired();
      const decode = (value: string): Buffer => { const result = Buffer.from(value, "base64url"); if (result.toString("base64url") !== value) expired(); return result; };
      const nonce = decode(nonceText); const tag = decode(tagText); if (nonce.length !== 12 || tag.length !== 16) expired();
      const decipher = createDecipheriv("aes-256-gcm", key.secret, nonce); decipher.setAAD(Buffer.from(`${format}.${id}`)); decipher.setAuthTag(tag);
      const payload = JSON.parse(Buffer.concat([decipher.update(decode(ciphertextText)), decipher.final()]).toString("utf8")) as Record<string, unknown>;
      const now = this.#now();
      if (payload.installationId !== this.#options.installationId || payload.recoveryEpoch !== this.#options.recoveryEpoch()
        || payload.principalId !== binding.principalId || payload.scopeSelectionHash !== namespace || payload.projectionGeneration !== this.#options.projectionGeneration()
        || !Number.isSafeInteger(now) || typeof payload.expiry !== "number" || !Number.isSafeInteger(payload.expiry) || payload.expiry <= now
        || typeof payload.commitCursor !== "number" || !Number.isSafeInteger(payload.commitCursor) || payload.commitCursor < 0
        || (payload.after !== undefined && (typeof payload.after !== "string" || payload.after.length > 256))) expired();
      return { commitCursor: payload.commitCursor, ...(payload.after === undefined ? {} : { after: payload.after as string }) };
    } catch { return expired(); }
  }
  close(): void { this.#closed = true; for (const namespace of this.#keys.keys()) this.#drop(namespace); }
}
