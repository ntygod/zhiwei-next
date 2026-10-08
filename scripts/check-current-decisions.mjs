import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OVERLAY_PATH, VIEW_PATH, repositoryReader, validateCurrentDecisions, renderCurrentDecisions } from "./current-decisions.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--write-view")) throw new Error("Usage: node scripts/check-current-decisions.mjs [--write-view]");
const data = JSON.parse(readFileSync(resolve(root, OVERLAY_PATH), "utf8"));
const result = validateCurrentDecisions(data, repositoryReader(root), { checkView: args.length === 0 });
if (args[0] === "--write-view") writeFileSync(resolve(root, VIEW_PATH), renderCurrentDecisions(data));
console.log(`Current decisions: ${result.decisions} structurally consistent records; recorded Accepted IDs: ${result.accepted.join(", ") || "none"}. GitHub approval NOT authenticated; stage completion NOT evaluated; current product applicability NOT evaluated. Evidence Ready checks current candidate files; terminal decisions retain historical evidence only. Original source/checker bytes preserved.`);
