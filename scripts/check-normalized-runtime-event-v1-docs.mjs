import {
  EXPECTED_EVENT_COUNT,
  EXPECTED_FIXTURE_HASH,
  readFile,
  requireValue,
  violations,
} from "./check-normalized-runtime-event-v1-context.mjs";

const FIXTURE_IDENTITY_DOCUMENTS = [
  "docs/architecture/pi-integration.md",
  "docs/architecture/normalized-runtime-event-v1.md",
  "docs/adr/0005-normalized-runtime-event-v1.md",
  "docs/harness/project-state.md",
];

const FIXTURE_COUNT_PATTERN =
  /(?:contract|executable)\s+Fixture[\s\S]{0,500}?(?:contains|构造|当前为)\s*(\d+)\s*(?:events?|个事件|-event)(?=\s|[,.;，。；]|$)/gi;
const FIXTURE_HASH_PATTERN =
  /canonical hash(?: is)?\s*[:：]?\s*([0-9a-f]{64})/gi;

function normalizeMarkdown(value) {
  return value
    .replace(/```[a-z0-9-]*\s*/gi, " ")
    .replace(/```/g, " ")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ");
}

function matches(value, pattern) {
  return [...value.matchAll(new RegExp(pattern.source, pattern.flags))];
}

for (const path of FIXTURE_IDENTITY_DOCUMENTS) {
  try {
    const document = normalizeMarkdown(await readFile(path, "utf8"));
    const eventCounts = matches(document, FIXTURE_COUNT_PATTERN).map((match) => Number(match[1]));
    const hashes = matches(document, FIXTURE_HASH_PATTERN).map((match) => match[1]);

    requireValue(
      eventCounts.length > 0,
      `${path} must declare the NormalizedRuntimeEvent v1 Contract Fixture event count.`,
    );
    requireValue(
      eventCounts.every((count) => count === EXPECTED_EVENT_COUNT),
      `${path} Contract Fixture event count drifted: ${eventCounts.join(", ") || "<missing>"}.`,
    );
    requireValue(
      hashes.length > 0,
      `${path} must declare the NormalizedRuntimeEvent v1 Contract Fixture canonical hash.`,
    );
    requireValue(
      hashes.every((hash) => hash === EXPECTED_FIXTURE_HASH),
      `${path} Contract Fixture canonical hash drifted: ${hashes.join(", ") || "<missing>"}.`,
    );
  } catch (error) {
    violations.push(`Could not validate Contract Fixture identity in ${path}: ${error.message}`);
  }
}
