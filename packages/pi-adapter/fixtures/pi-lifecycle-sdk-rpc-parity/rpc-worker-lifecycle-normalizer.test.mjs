import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertProviderErrorNormalizationMutationTests } from "./rpc-worker-lifecycle-normalizer.mjs";

const replacementPath = fileURLToPath(
  new URL("./rpc-worker-lifecycle-provider-error-replacement.json", import.meta.url),
);
const document = JSON.parse(await readFile(resolve(replacementPath), "utf8"));
if (document?.caseName !== "acceptedProviderError" || !document?.replacement) {
  throw new Error("Provider-error replacement test source is invalid.");
}
assertProviderErrorNormalizationMutationTests(document.replacement);
console.log("RPC Worker Provider-error State normalization mutations: OK");
