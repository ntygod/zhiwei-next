const ranks = { R0: 0, R1: 1, R2: 2, R3: 3 };
const body = process.env.PR_BODY ?? "";
const changedFiles = JSON.parse(process.env.CHANGED_FILES_JSON ?? "[]");
const violations = [];

function parseMetadata(text) {
  const source = text ?? "";
  const marker = "zhiwei-harness";
  const markerIndex = source.lastIndexOf(marker);
  if (markerIndex < 0) return undefined;
  const commentStart = source.lastIndexOf("<!--", markerIndex);
  const commentEnd = source.indexOf("-->", markerIndex + marker.length);
  if (commentStart < 0 || commentEnd < 0 || commentStart > markerIndex) return undefined;

  const result = {};
  const block = source.slice(markerIndex + marker.length, commentEnd);
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.includes(":")) continue;
    const separator = line.indexOf(":");
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return result;
}

function maxRisk(left, right) {
  return ranks[left] >= ranks[right] ? left : right;
}

function inferMinimumRisk(files) {
  let risk = "R0";
  for (const path of files) {
    if (
      path === "SECURITY.md" ||
      path === "docs/architecture/trust-and-safety.md" ||
      path.startsWith(".github/workflows/") ||
      /(?:secret|credential|privacy|deletion|forget)/i.test(path)
    ) {
      risk = maxRisk(risk, "R3");
      continue;
    }
    if (
      path === "AGENTS.md" ||
      path.endsWith("/AGENTS.md") ||
      path === "harness.config.json" ||
      path.startsWith("docs/harness/") ||
      path.startsWith("docs/adr/") ||
      path.startsWith("packages/domain/") ||
      path.startsWith("packages/protocol/") ||
      path.startsWith("packages/memory-store/") ||
      path === "package.json" ||
      path === ".github/pull_request_template.md" ||
      path.startsWith("scripts/check-")
    ) {
      risk = maxRisk(risk, "R2");
      continue;
    }
    if (
      path.startsWith("apps/") ||
      path.startsWith("packages/") ||
      /\.(?:ts|tsx|js|jsx|mjs|cjs|json|yml|yaml)$/.test(path)
    ) {
      risk = maxRisk(risk, "R1");
    }
  }
  return risk;
}

function isGovernanceChange(files) {
  return files.some((path) =>
    path === "AGENTS.md" ||
    path.endsWith("/AGENTS.md") ||
    path === "harness.config.json" ||
    path.startsWith("docs/harness/") ||
    path === ".github/pull_request_template.md" ||
    path.startsWith(".github/workflows/") ||
    path === "scripts/check-agents.mjs" ||
    path === "scripts/check-harness.mjs" ||
    path === "scripts/check-pr-contract.mjs"
  );
}

const requiredHeadings = [
  "## 目标与结果",
  "## 范围与非目标",
  "## 风险与回滚",
  "## 验证证据",
  "## 自主交付记录",
];
for (const heading of requiredHeadings) {
  if (!body.includes(heading)) violations.push(`PR body is missing required heading: ${heading}`);
}

const metadata = parseMetadata(body);
if (!metadata) {
  violations.push("PR body is missing the <!-- zhiwei-harness ... --> metadata block.");
} else {
  const declaredRisk = metadata.risk;
  const minimumRisk = inferMinimumRisk(changedFiles);
  if (!(declaredRisk in ranks)) {
    violations.push(`Invalid or missing risk value: ${declaredRisk ?? "<missing>"}`);
  } else if (ranks[declaredRisk] < ranks[minimumRisk]) {
    violations.push(`Declared risk ${declaredRisk} is below machine-inferred minimum ${minimumRisk}.`);
  }

  if (!new Set(["yes", "no"]).has(metadata["autonomous-merge"])) {
    violations.push("autonomous-merge must be yes or no.");
  }
  if (!new Set(["not-required", "required", "complete"]).has(metadata["independent-review"])) {
    violations.push("independent-review must be not-required, required, or complete.");
  }
  if (!new Set(["yes", "no"]).has(metadata["governance-change"])) {
    violations.push("governance-change must be yes or no.");
  }
  if (!new Set(["updated", "not-needed"]).has(metadata["project-state"])) {
    violations.push("project-state must be updated or not-needed.");
  }
  if (!new Set(["provided", "not-required"]).has(metadata.rollback)) {
    violations.push("rollback must be provided or not-required.");
  }

  const effectiveRisk = declaredRisk in ranks ? declaredRisk : minimumRisk;
  if (ranks[effectiveRisk] >= ranks.R2 && metadata["independent-review"] === "not-required") {
    violations.push(`${effectiveRisk} changes require independent AI review.`);
  }
  if (ranks[effectiveRisk] >= ranks.R2 && metadata.rollback !== "provided") {
    violations.push(`${effectiveRisk} changes require a rollback or recovery plan.`);
  }

  const governance = isGovernanceChange(changedFiles);
  if (governance && metadata["governance-change"] !== "yes") {
    violations.push("Changed files affect governance, but governance-change is not yes.");
  }
  if (!governance && metadata["governance-change"] === "yes" && ranks[effectiveRisk] < ranks.R2) {
    violations.push("A declared governance change must use at least risk R2.");
  }
}

if (violations.length > 0) {
  console.error("PR contract violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`PR contract: OK (${changedFiles.length} files, minimum risk ${inferMinimumRisk(changedFiles)})`);
