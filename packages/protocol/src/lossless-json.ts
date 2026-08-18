import { sha256HexUtf8 } from "./sha256.ts";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface JsonSnapshotLimits {
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxStringLength?: number;
  readonly maxContainerEntries?: number;
}

const DEFAULT_LIMITS = Object.freeze({
  maxDepth: 128,
  maxNodes: 100_000,
  maxStringLength: 4 * 1024 * 1024,
  maxContainerEntries: 100_000,
});

function fail(path: string, message: string): never {
  throw new TypeError(`${path}: ${message}`);
}

function arrayIndexKeys(length: number): Set<string> {
  return new Set(Array.from({ length }, (_, index) => String(index)));
}

/**
 * Takes one detached, JSON-safe snapshot of an untrusted value.
 * Accessors, aliases, cycles, sparse arrays and exotic prototypes fail closed.
 */
export function snapshotJsonValue(
  input: unknown,
  limits: JsonSnapshotLimits = {},
): JsonValue {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  let nodes = 0;
  const seen = new WeakSet<object>();

  const visit = (value: unknown, path: string, depth: number): JsonValue => {
    nodes += 1;
    if (nodes > resolved.maxNodes) fail(path, "JSON value exceeds the node limit");
    if (depth > resolved.maxDepth) fail(path, "JSON value exceeds the depth limit");

    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > resolved.maxStringLength) fail(path, "string exceeds the length limit");
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail(path, "number must be finite");
      if (Object.is(value, -0)) fail(path, "negative zero is not canonical JSON");
      return value;
    }
    if (typeof value !== "object") {
      fail(path, `unsupported JSON value type: ${typeof value}`);
    }
    if (seen.has(value)) fail(path, "cycles and object aliases are not allowed");
    seen.add(value);

    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        fail(path, "array prototype must be Array.prototype");
      }
      if (value.length > resolved.maxContainerEntries) {
        fail(path, "array exceeds the entry limit");
      }
      const expectedIndexes = arrayIndexKeys(value.length);
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === "symbol") fail(path, "symbol keys are not allowed");
        if (key === "length") continue;
        if (!expectedIndexes.has(key)) fail(path, `unexpected array property ${JSON.stringify(key)}`);
      }
      const output: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          fail(`${path}[${index}]`, "sparse arrays are not allowed");
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
          fail(`${path}[${index}]`, "array entries must be enumerable data properties");
        }
        output.push(visit(descriptor.value, `${path}[${index}]`, depth + 1));
      }
      return output;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail(path, "object prototype must be Object.prototype or null");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > resolved.maxContainerEntries) {
      fail(path, "object exceeds the entry limit");
    }
    const stringKeys: string[] = [];
    for (const key of keys) {
      if (typeof key === "symbol") fail(path, "symbol keys are not allowed");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
        fail(`${path}.${key}`, "object fields must be enumerable data properties");
      }
      stringKeys.push(key);
    }
    stringKeys.sort();
    const output: Record<string, JsonValue> = {};
    for (const key of stringKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      Object.defineProperty(output, key, {
        value: visit(descriptor.value, `${path}.${key}`, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return output;
  };

  return visit(input, "$", 0);
}

function stringifySnapshot(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stringifySnapshot).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stringifySnapshot(value[key])}`)
    .join(",")}}`;
}

export function canonicalJsonV1(input: unknown): string {
  return stringifySnapshot(snapshotJsonValue(input));
}

export function canonicalJsonSha256V1(input: unknown): string {
  return sha256HexUtf8(canonicalJsonV1(input));
}
