import { canonicalJsonV1 } from "./lossless-json.ts";
import { decodeWireJson } from "./cognitive-wire.ts";
import { parseLocalApiCommandV1, parseLocalApiMemorySearchV1 } from "./local-api-v1-parse.ts";
import { parseLocalApiReceiptV1, parseLocalApiErrorV1 } from "./local-api-v1-response.ts";
import type { LocalApiCommandV1, LocalApiRouteV1, LocalApiReceiptV1, LocalApiErrorV1, LocalApiMemorySearchV1 } from "./local-api-v1-types.ts";
export * from "./local-api-v1-types.ts";
export { parseLocalApiCommandV1, parseLocalApiMemorySearchV1, parseLocalApiReceiptV1, parseLocalApiErrorV1 };
export function serializeLocalApiCommandV1(input: unknown): string { return canonicalJsonV1(parseLocalApiCommandV1(input)); }
export function deserializeLocalApiCommandV1(input: string, route?: LocalApiRouteV1): LocalApiCommandV1 { return parseLocalApiCommandV1(decodeWireJson(input), route); }
export function serializeLocalApiReceiptV1(input: unknown): string { return canonicalJsonV1(parseLocalApiReceiptV1(input)); }
export function deserializeLocalApiReceiptV1(input: string): LocalApiReceiptV1 { return parseLocalApiReceiptV1(decodeWireJson(input)); }
export function serializeLocalApiErrorV1(input: unknown): string { return canonicalJsonV1(parseLocalApiErrorV1(input)); }
export function deserializeLocalApiErrorV1(input: string): LocalApiErrorV1 { return parseLocalApiErrorV1(decodeWireJson(input)); }
export function serializeLocalApiMemorySearchV1(input: unknown): string { return canonicalJsonV1(parseLocalApiMemorySearchV1(input)); }
export function deserializeLocalApiMemorySearchV1(input: string): LocalApiMemorySearchV1 { return parseLocalApiMemorySearchV1(decodeWireJson(input)); }
