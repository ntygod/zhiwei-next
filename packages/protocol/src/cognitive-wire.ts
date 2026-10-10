import {
  assertIdentifierV2, assertRevisionV2, assertIsoTimestampV2, assertTextV2, type DomainErrorV2,
} from "../../domain/src/index.ts";
import { snapshotJsonValue } from "./lossless-json.ts";

/** A syntax failure only. No authenticated identity, permission or commit is implied. */
export class CognitiveProtocolError extends TypeError implements DomainErrorV2 {
  readonly safeMessage: string;
  readonly retryable = false;
  readonly code: "validation" | "unsupported";
  readonly reason: "invalid_shape" | "too_large" | "protocol_version";
  constructor(reason: "invalid_shape" | "too_large" | "protocol_version" = "invalid_shape") {
    super(reason === "protocol_version" ? "Unsupported protocol version" : "Invalid protocol input");
    this.name = "CognitiveProtocolError";
    this.safeMessage = this.message;
    this.code = reason === "protocol_version" ? "unsupported" : "validation";
    this.reason = reason;
  }
}
export function invalid(): never { throw new CognitiveProtocolError(); }
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
export function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  if (required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalid();
}
export function member<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) invalid();
  return value as T;
}
export function identifier(value: unknown): string { assertIdentifierV2(value); return value; }
export function revision(value: unknown, allowZero = false): number {
  if (allowZero && value === 0) return 0;
  assertRevisionV2(value); return value;
}
export function timestamp(value: unknown): string { assertIsoTimestampV2(value); return value; }
export function textValue(value: unknown, max = 65_536): string {
  assertTextV2(value, max);
  return value;
}
export function list(value: unknown, max = 100, min = 0): readonly unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid();
  return value;
}
export function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) invalid();
}
export function version(value: unknown, expected: number): void {
  if (value !== expected) throw new CognitiveProtocolError("protocol_version");
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Bound and detach before evaluating shape. Accessors and hidden fields are rejected without reading them. */
export function wireBoundary<T>(input: unknown, validate: (value: Record<string, unknown>) => T): T {
  try {
    const snapshot = snapshotJsonValue(input, { maxDepth: 32, maxNodes: 20_000, maxStringLength: 1_048_576, maxContainerEntries: 1000 });
    if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > 1_048_576) {
      throw new CognitiveProtocolError("too_large");
    }
    return freeze(validate(object(snapshot)));
  } catch (error) {
    if (error instanceof CognitiveProtocolError) throw error;
    throw new CognitiveProtocolError();
  }
}

/** JSON.parse alone silently accepts duplicate object keys, including escaped spellings. */
export function decodeWireJson(input: string): unknown {
  try {
    if (typeof input !== "string") invalid();
    if (new TextEncoder().encode(input).byteLength > 1_048_576) throw new CognitiveProtocolError("too_large");
    const parsed: unknown = JSON.parse(input);
    let position = 0;
    const skip = () => { while (/\s/.test(input[position] ?? "") && position < input.length) position++; };
    const string = (): string => {
      const start = position++;
      while (position < input.length) {
        const char = input[position++];
        if (char === "\\") position++;
        else if (char === '"') return JSON.parse(input.slice(start, position)) as string;
      }
      return invalid();
    };
    const scan = (depth: number): void => {
      if (depth > 32) invalid();
      skip();
      const char = input[position];
      if (char === '"') { string(); return; }
      if (char === "{") {
        position++; skip();
        const seen = new Set<string>();
        if (input[position] === "}") { position++; return; }
        while (position < input.length) {
          skip(); const key = string();
          if (seen.has(key)) invalid();
          seen.add(key); skip(); position++; scan(depth + 1); skip();
          if (input[position++] === "}") return;
        }
        invalid();
      }
      if (char === "[") {
        position++; skip();
        if (input[position] === "]") { position++; return; }
        while (position < input.length) {
          scan(depth + 1); skip();
          if (input[position++] === "]") return;
        }
        invalid();
      }
      while (position < input.length && !/[\s,}\]]/.test(input[position])) position++;
    };
    scan(0); skip();
    if (position !== input.length) invalid();
    return parsed;
  } catch (error) {
    if (error instanceof CognitiveProtocolError) throw error;
    throw new CognitiveProtocolError();
  }
}
