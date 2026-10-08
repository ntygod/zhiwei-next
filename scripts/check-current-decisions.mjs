import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OVERLAY_PATH, repositoryReader, validateCurrentDecisions, renderCurrentDecisions } from "./current-decisions.mjs";
import { writeCurrentDecisionsView } from "./write-current-decisions-view.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--write-view")) throw new Error("Usage: node scripts/check-current-decisions.mjs [--write-view]");
const reader = repositoryReader(root);
const data = JSON.parse(reader.read(OVERLAY_PATH));
let result = validateCurrentDecisions(data, reader, { checkView: args.length === 0 });
if (args[0] === "--write-view") {
  writeCurrentDecisionsView(root, renderCurrentDecisions(data));
  // Report the actual post-write source and generated view, not the stale pre-write result.
  result = validateCurrentDecisions(JSON.parse(reader.read(OVERLAY_PATH)), reader);
}
console.log(`Current decisions: ${result.decisions} structurally consistent records; recorded Accepted IDs: ${result.accepted.join(", ") || "none"}. GitHub approval NOT authenticated; stage completion NOT evaluated; current product applicability NOT evaluated. Evidence Ready checks current candidate files; terminal decisions retain historical evidence only. Original source/checker bytes preserved.`);
