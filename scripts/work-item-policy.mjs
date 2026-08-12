const ISSUE_REFERENCE = /^#([1-9]\d*)$/;
const PRIMARY_PREFIXES = ["feat/", "fix/", "docs/", "chore/", "spike/"];
const FORBIDDEN_PRIMARY_PREFIXES = ["ai/", "automation/", "helper/", "recovery/"];
const RETIREMENT_PATTERNS = [
  /\bretire\b[^\n]*\bbranch\b/i,
  /退休[^\n]*分支/i,
  /关闭本\s*PR[^\n]*(?:Branch Cleanup|分支)/i,
  /仅用于[^\n]*(?:回收|删除|退休)[^\n]*分支/i,
];
const NOOP_PATTERNS = [
  /^__?noop__?$/i,
  /^ignore[-_ ]?this[-_ ]?test$/i,
  /capability[-_ ]?test/i,
];

export function parseHarnessMetadata(text) {
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

export function parseNumberReference(value, { allowNone = false } = {}) {
  if (allowNone && value === "none") return null;
  const match = ISSUE_REFERENCE.exec(value ?? "");
  return match ? Number(match[1]) : undefined;
}

export function branchContainsWorkItem(headRef, workItemNumber) {
  if (!headRef || !Number.isInteger(workItemNumber)) return false;
  return new RegExp(`(?:^|[/_-])${workItemNumber}(?:[/_-]|$)`).test(headRef);
}

export function isRetirementPullRequest({ title = "", body = "" }) {
  return RETIREMENT_PATTERNS.some((pattern) => pattern.test(title) || pattern.test(body));
}

export function isNoopObjectTitle(title = "") {
  return NOOP_PATTERNS.some((pattern) => pattern.test(title.trim()));
}

export function validatePullRequestWorkItemContract({
  body = "",
  title = "",
  headRef = "",
  prNumber,
}) {
  const violations = [];
  const metadata = parseHarnessMetadata(body);
  if (!metadata) {
    return ["PR body is missing the zhiwei-harness metadata block required for work item governance."];
  }

  const workItem = parseNumberReference(metadata["work-item"]);
  const ownerInput = parseNumberReference(metadata["owner-input"], { allowNone: true });
  const supersedesPr = parseNumberReference(metadata["supersedes-pr"], { allowNone: true });
  const prRole = metadata["pr-role"];

  if (!Number.isInteger(workItem)) {
    violations.push("work-item must be an Issue reference in the form #N.");
  }
  if (!new Set(["primary", "recovery"]).has(prRole)) {
    violations.push("pr-role must be primary or recovery.");
  }
  if (ownerInput === undefined) {
    violations.push("owner-input must be an Issue reference in the form #N or none.");
  }
  if (supersedesPr === undefined) {
    violations.push("supersedes-pr must be a Pull Request reference in the form #N or none.");
  }
  if (Number.isInteger(prNumber) && supersedesPr === prNumber) {
    violations.push("supersedes-pr cannot reference the current Pull Request.");
  }

  if (prRole === "primary" && Number.isInteger(workItem)) {
    if (!PRIMARY_PREFIXES.some((prefix) => headRef.startsWith(prefix))) {
      violations.push(
        `Primary PR branch must start with one of ${PRIMARY_PREFIXES.join(", ")}; got ${headRef || "<missing>"}.`,
      );
    }
    if (FORBIDDEN_PRIMARY_PREFIXES.some((prefix) => headRef.startsWith(prefix))) {
      violations.push(`Primary PR branch uses a forbidden helper/recovery prefix: ${headRef}.`);
    }
    if (!branchContainsWorkItem(headRef, workItem)) {
      violations.push(`Primary PR branch ${headRef || "<missing>"} must contain work item number ${workItem}.`);
    }
  }

  if (prRole === "recovery" && !headRef.startsWith("recovery/")) {
    violations.push(`Recovery PR branch must start with recovery/; got ${headRef || "<missing>"}.`);
  }

  if (Number.isInteger(workItem)) {
    const references = [...body.matchAll(/(?:Addresses|Closes|Fixes)\s+#([1-9]\d*)\b/gi)].map(
      (match) => Number(match[1]),
    );
    if (!references.includes(workItem)) {
      violations.push(`PR body must reference work-item #${workItem} using Addresses, Closes, or Fixes.`);
    }
  }

  if (isRetirementPullRequest({ title, body })) {
    violations.push("A Pull Request must not exist only to retire or clean up a branch.");
  }
  if (isNoopObjectTitle(title)) {
    violations.push("No-op or capability-test Pull Requests are forbidden in the real repository.");
  }

  return violations;
}

export function auditRepositoryWorkItems({
  defaultBranch,
  branches,
  openPullRequests,
  allowedOrphanBranches = [],
  maxOpenPrimaryPullRequests = 2,
}) {
  const findings = [];
  const primaryByWorkItem = new Map();
  const allowedOrphanBranchSet = new Set(allowedOrphanBranches);
  const openHeadRefs = new Set(openPullRequests.map((pullRequest) => pullRequest.head?.ref).filter(Boolean));
  let openPrimaryPullRequestCount = 0;

  for (const pullRequest of openPullRequests) {
    const metadata = parseHarnessMetadata(pullRequest.body ?? "");
    if (isRetirementPullRequest({ title: pullRequest.title, body: pullRequest.body })) {
      findings.push({
        kind: "retirement-pr",
        severity: "error",
        pullRequest: pullRequest.number,
        message: `Open PR #${pullRequest.number} exists only to retire a branch.`,
      });
    }
    if (isNoopObjectTitle(pullRequest.title ?? "")) {
      findings.push({
        kind: "noop-pr",
        severity: "error",
        pullRequest: pullRequest.number,
        message: `Open PR #${pullRequest.number} has a no-op/capability-test title.`,
      });
    }
    if (!metadata) continue;
    const workItem = parseNumberReference(metadata["work-item"]);
    if (metadata["pr-role"] === "primary" && Number.isInteger(workItem)) {
      openPrimaryPullRequestCount += 1;
      const pullRequests = primaryByWorkItem.get(workItem) ?? [];
      pullRequests.push(pullRequest.number);
      primaryByWorkItem.set(workItem, pullRequests);
    }
  }

  if (openPrimaryPullRequestCount > maxOpenPrimaryPullRequests) {
    findings.push({
      kind: "primary-pr-wip-limit",
      severity: "error",
      message: `Open primary PR count ${openPrimaryPullRequestCount} exceeds limit ${maxOpenPrimaryPullRequests}.`,
    });
  }

  for (const [workItem, pullRequests] of primaryByWorkItem) {
    if (pullRequests.length > 1) {
      findings.push({
        kind: "multiple-primary-prs",
        severity: "error",
        workItem,
        pullRequests: [...pullRequests].sort((left, right) => left - right),
        message: `Work item #${workItem} has multiple open primary PRs: ${pullRequests.join(", ")}.`,
      });
    }
  }

  for (const branch of branches) {
    const name = branch.name;
    if (!name || name === defaultBranch || openHeadRefs.has(name) || allowedOrphanBranchSet.has(name)) continue;
    if (name.startsWith("automation/") || name.startsWith("ai/")) {
      findings.push({
        kind: "orphan-forbidden-helper-branch",
        severity: "error",
        branch: name,
        headSha: branch.commit?.sha,
        message: `Forbidden helper branch has no open PR: ${name}.`,
      });
      continue;
    }
    if (name.startsWith("helper/")) {
      findings.push({
        kind: "orphan-helper-branch",
        severity: "error",
        branch: name,
        headSha: branch.commit?.sha,
        message: `Helper branch has no active lease visible to repository audit: ${name}.`,
      });
      continue;
    }
    if (
      ["feat/", "fix/", "docs/", "chore/", "spike/", "recovery/"].some((prefix) => name.startsWith(prefix)) &&
      !/(?:^|[/_-])[1-9]\d*(?:[/_-]|$)/.test(name)
    ) {
      findings.push({
        kind: "branch-without-work-item",
        severity: "error",
        branch: name,
        headSha: branch.commit?.sha,
        message: `Branch does not contain a work item number: ${name}.`,
      });
    }
  }

  return findings.sort((left, right) => left.message.localeCompare(right.message));
}

export function selectAllowlistedLegacyHelperBranches({
  defaultBranch,
  branches,
  openPullRequests,
  cleanupEntries,
}) {
  const branchByName = new Map(branches.map((branch) => [branch.name, branch]));
  const openHeadRefs = new Set(openPullRequests.map((pullRequest) => pullRequest.head?.ref).filter(Boolean));
  const candidates = [];

  for (const entry of cleanupEntries ?? []) {
    if (entry.action !== "delete-branch") continue;
    const branch = branchByName.get(entry.branch);
    if (!branch) continue;
    if (entry.branch === defaultBranch || branch.protected === true || openHeadRefs.has(entry.branch)) continue;
    if (branch.commit?.sha !== entry.expectedHead) continue;
    candidates.push({ name: entry.branch, headSha: entry.expectedHead, reason: entry.reason });
  }

  return candidates.sort((left, right) => left.name.localeCompare(right.name));
}

export function workItemPolicyScenarios() {
  const validBody = `Addresses #57\n<!--\nzhiwei-harness\nwork-item: #57\npr-role: primary\nowner-input: #44\nsupersedes-pr: none\n-->`;
  return [
    {
      name: "valid primary PR",
      input: {
        body: validBody,
        title: "chore(harness): govern lifecycle",
        headRef: "chore/57-work-item-lifecycle",
        prNumber: 59,
      },
      expected: [],
    },
    {
      name: "branch must contain issue number",
      input: {
        body: validBody,
        title: "chore(harness): govern lifecycle",
        headRef: "chore/work-item-lifecycle",
        prNumber: 59,
      },
      includes: "must contain work item number 57",
    },
    {
      name: "automation primary branch is forbidden",
      input: {
        body: validBody,
        title: "chore(harness): govern lifecycle",
        headRef: "automation/57-review",
        prNumber: 59,
      },
      includes: "Primary PR branch",
    },
    {
      name: "retirement PR is forbidden",
      input: {
        body: validBody,
        title: "chore: retire branch",
        headRef: "chore/57-work-item-lifecycle",
        prNumber: 59,
      },
      includes: "retire or clean up a branch",
    },
    {
      name: "no-op PR is forbidden",
      input: {
        body: validBody,
        title: "__noop__",
        headRef: "chore/57-work-item-lifecycle",
        prNumber: 59,
      },
      includes: "No-op or capability-test Pull Requests",
    },
    {
      name: "owner input must be reference or none",
      input: {
        body: validBody.replace("owner-input: #44", "owner-input: idea"),
        title: "chore(harness): govern lifecycle",
        headRef: "chore/57-work-item-lifecycle",
        prNumber: 59,
      },
      includes: "owner-input",
    },
    {
      name: "work item must be referenced by body",
      input: {
        body: validBody.replace("Addresses #57", "Related #57"),
        title: "chore(harness): govern lifecycle",
        headRef: "chore/57-work-item-lifecycle",
        prNumber: 59,
      },
      includes: "using Addresses, Closes, or Fixes",
    },
    {
      name: "recovery branch requires recovery role",
      input: {
        body: validBody.replace("pr-role: primary", "pr-role: recovery"),
        title: "fix: recover main",
        headRef: "chore/57-work-item-lifecycle",
        prNumber: 59,
      },
      includes: "Recovery PR branch",
    },
    {
      name: "multiple primary PRs are detected",
      repository: {
        defaultBranch: "main",
        branches: [{ name: "main", commit: { sha: "main" } }],
        openPullRequests: [
          { number: 1, title: "one", body: validBody, head: { ref: "chore/57-one" } },
          { number: 2, title: "two", body: validBody, head: { ref: "chore/57-two" } },
        ],
      },
      finding: "multiple-primary-prs",
    },
    {
      name: "allowlisted exact helper is selected",
      cleanup: {
        defaultBranch: "main",
        branches: [
          { name: "main", protected: false, commit: { sha: "main" } },
          { name: "automation/export", protected: false, commit: { sha: "helper-sha" } },
        ],
        openPullRequests: [],
        cleanupEntries: [
          { branch: "automation/export", expectedHead: "helper-sha", action: "delete-branch", reason: "legacy" },
        ],
      },
      selected: ["automation/export"],
    },
  ];
}

export function runWorkItemPolicySelfTests() {
  for (const scenario of workItemPolicyScenarios()) {
    if (scenario.input) {
      const violations = validatePullRequestWorkItemContract(scenario.input);
      if (scenario.expected && JSON.stringify(violations) !== JSON.stringify(scenario.expected)) {
        throw new Error(`${scenario.name}: expected ${JSON.stringify(scenario.expected)}, got ${JSON.stringify(violations)}`);
      }
      if (scenario.includes && !violations.some((violation) => violation.includes(scenario.includes))) {
        throw new Error(`${scenario.name}: missing violation containing ${scenario.includes}`);
      }
    }
    if (scenario.repository) {
      const findings = auditRepositoryWorkItems(scenario.repository);
      if (!findings.some((finding) => finding.kind === scenario.finding)) {
        throw new Error(`${scenario.name}: missing finding ${scenario.finding}`);
      }
    }
    if (scenario.cleanup) {
      const selected = selectAllowlistedLegacyHelperBranches(scenario.cleanup).map((entry) => entry.name);
      if (JSON.stringify(selected) !== JSON.stringify(scenario.selected)) {
        throw new Error(`${scenario.name}: expected ${JSON.stringify(scenario.selected)}, got ${JSON.stringify(selected)}`);
      }
    }
  }
}
