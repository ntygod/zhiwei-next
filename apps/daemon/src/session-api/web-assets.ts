import type { ServerResponse } from "node:http";
import { SessionApiError } from "./service.ts";

export interface WorkbenchAssets { readonly html: string; readonly javascript: string; readonly stylesheet: string }
export interface WorkbenchAssetServer { serve(path: string, response: ServerResponse): boolean }
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
/** Startup-owned compiled strings only. No request-derived path or filesystem access. */
export function createWorkbenchAssetServer(input: WorkbenchAssets): WorkbenchAssetServer {
  if (!input || typeof input !== "object" || Object.getPrototypeOf(input) !== Object.prototype) throw new SessionApiError("validation", "invalid_shape", 400);
  const properties = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(properties).length !== 3 || ["html", "javascript", "stylesheet"].some(key => !properties[key] || !("value" in properties[key])
    || typeof properties[key].value !== "string" || !properties[key].value.length || Buffer.byteLength(properties[key].value) > 4_194_304)) throw new SessionApiError("validation", "invalid_shape", 400);
  const entries = new Map([
    ["/", { body: input.html, type: "text/html; charset=utf-8" }],
    ["/assets/workbench.js", { body: input.javascript, type: "text/javascript; charset=utf-8" }],
    ["/assets/workbench.css", { body: input.stylesheet, type: "text/css; charset=utf-8" }],
  ]);
  return { serve(path, response) {
    const entry = entries.get(path); if (!entry) return false;
    response.writeHead(200, { "content-type": entry.type, "cache-control": "no-store", "x-content-type-options": "nosniff",
      "content-security-policy": csp, "referrer-policy": "no-referrer", "connection": "close" }); response.end(entry.body); return true;
  } };
}
