export function selectClosedPullRequestBranches({
  repositoryFullName,
  defaultBranch,
  branches,
  openPullRequests,
  closedPullRequests,
}) {
  const existingBranches = new Map(
    branches.map((branch) => [branch.name, branch]),
  );
  const openPullRequestHeadRefs = new Set(
    openPullRequests
      .filter((pullRequest) =>
        pullRequest.head?.repo?.full_name === repositoryFullName
      )
      .map((pullRequest) => pullRequest.head.ref),
  );
  const closedPullRequestsByHeadRef = new Map();

  for (const pullRequest of closedPullRequests) {
    if (pullRequest.head?.repo?.full_name !== repositoryFullName) continue;
    const headRef = pullRequest.head.ref;
    const records = closedPullRequestsByHeadRef.get(headRef) ?? [];
    records.push({
      number: pullRequest.number,
      headSha: pullRequest.head.sha,
    });
    closedPullRequestsByHeadRef.set(headRef, records);
  }

  const selected = [];
  for (const [branchName, pullRecords] of closedPullRequestsByHeadRef) {
    const branch = existingBranches.get(branchName);
    if (!branch) continue;
    if (branchName === defaultBranch) continue;
    if (branch.protected === true) continue;
    if (openPullRequestHeadRefs.has(branchName)) continue;

    const matchingClosedPullRequests = pullRecords.filter(
      (record) => record.headSha === branch.commit?.sha,
    );
    if (matchingClosedPullRequests.length === 0) continue;

    selected.push({
      name: branchName,
      headSha: branch.commit.sha,
      pullRequests: matchingClosedPullRequests
        .map((record) => record.number)
        .sort((left, right) => left - right),
    });
  }

  return selected.sort((left, right) => left.name.localeCompare(right.name));
}

export function branchCleanupPolicyScenarios() {
  const branch = (name, protectedBranch = false, sha = `${name}-sha`) => ({
    name,
    protected: protectedBranch,
    commit: { sha },
  });
  const pullRequest = (
    number,
    ref,
    fullName = "owner/repo",
    sha = `${ref}-sha`,
  ) => ({
    number,
    head: { ref, sha, repo: { full_name: fullName } },
  });

  return [
    {
      name: "closed same-repository branch is selected",
      branches: [branch("main"), branch("feat/closed")],
      openPullRequests: [],
      closedPullRequests: [pullRequest(1, "feat/closed")],
      expected: ["feat/closed"],
    },
    {
      name: "multiple closed PR records are stable and sorted",
      branches: [branch("main"), branch("feat/repeated")],
      openPullRequests: [],
      closedPullRequests: [
        pullRequest(8, "feat/repeated"),
        pullRequest(2, "feat/repeated"),
      ],
      expected: ["feat/repeated"],
      expectedPullRequests: [2, 8],
    },
    {
      name: "open pull request branch is preserved",
      branches: [branch("main"), branch("feat/open")],
      openPullRequests: [pullRequest(2, "feat/open")],
      closedPullRequests: [pullRequest(1, "feat/open")],
      expected: [],
    },
    {
      name: "reused or advanced branch is preserved",
      branches: [branch("main"), branch("feat/reused", false, "new-head")],
      openPullRequests: [],
      closedPullRequests: [
        pullRequest(3, "feat/reused", "owner/repo", "closed-pr-head"),
      ],
      expected: [],
    },
    {
      name: "default and protected branches are preserved",
      branches: [branch("main"), branch("release/stable", true)],
      openPullRequests: [],
      closedPullRequests: [
        pullRequest(4, "main"),
        pullRequest(5, "release/stable"),
      ],
      expected: [],
    },
    {
      name: "fork and no-PR branches are preserved",
      branches: [branch("main"), branch("fork/work"), branch("local/no-pr")],
      openPullRequests: [],
      closedPullRequests: [pullRequest(6, "fork/work", "other/repo")],
      expected: [],
    },
    {
      name: "missing branch is idempotently ignored",
      branches: [branch("main")],
      openPullRequests: [],
      closedPullRequests: [pullRequest(7, "already/deleted")],
      expected: [],
    },
  ];
}

export function runBranchCleanupPolicySelfTests() {
  for (const scenario of branchCleanupPolicyScenarios()) {
    const selected = selectClosedPullRequestBranches({
      repositoryFullName: "owner/repo",
      defaultBranch: "main",
      branches: scenario.branches,
      openPullRequests: scenario.openPullRequests,
      closedPullRequests: scenario.closedPullRequests,
    });
    const actual = selected.map((entry) => entry.name);
    if (JSON.stringify(actual) !== JSON.stringify(scenario.expected)) {
      throw new Error(
        `Branch cleanup policy self-test failed: ${scenario.name}; ` +
        `expected=${JSON.stringify(scenario.expected)}, actual=${JSON.stringify(actual)}`,
      );
    }
    if (
      scenario.expectedPullRequests &&
      JSON.stringify(selected[0]?.pullRequests) !==
        JSON.stringify(scenario.expectedPullRequests)
    ) {
      throw new Error(
        `Branch cleanup PR ordering self-test failed: ${scenario.name}; ` +
        `expected=${JSON.stringify(scenario.expectedPullRequests)}, ` +
        `actual=${JSON.stringify(selected[0]?.pullRequests)}`,
      );
    }
  }
}
