/** Internal P0-04 synthetic-value preparation; this is not a sendable capsule. */
export const COMPILER_REVISION = "context-budget-v1";
export const RENDERER_REVISION = "context-budget-json-lines-v1";
export type BudgetCategory = "current" | "experience" | "open";
export interface MaterialRef { readonly id: string; readonly version: number }
export interface SourceRef extends MaterialRef { readonly selector: string }
export interface BudgetMaterial extends MaterialRef {
  readonly sourceRefs: readonly SourceRef[];
  readonly body: string;
  readonly category: BudgetCategory;
  readonly required: boolean;
  readonly priorityOrdinal: number;
  readonly conflictGroupId?: string;
  readonly conflictMembers?: readonly MaterialRef[];
}
export interface BudgetLimits {
  readonly contextLimit: number;
  readonly reservedOutput: number;
  readonly mandatoryProtocolOverhead: number;
}
export interface ExactTokenCounter {
  readonly id: string;
  readonly version: string;
  readonly mode: "exact";
  readonly count: (text: string) => number;
}
export interface BudgetSelectionInput {
  /** All four identities are mandatory; an explicitly empty body is allowed. */
  readonly base: {
    readonly constraints: string;
    readonly currentRequest: string;
    readonly acceptanceCriteria: string;
    readonly workingState: string;
  };
  readonly materials: readonly BudgetMaterial[];
  readonly budget: BudgetLimits;
  readonly counter: ExactTokenCounter;
}
export type SelectionReason = "required" | "selected_by_category" | "selected_by_borrow" |
  "category_budget" | "memory_budget" | "final_budget";
export interface SelectionUnit {
  readonly members: readonly BudgetMaterial[];
  readonly refs: readonly MaterialRef[];
  readonly conflictGroupId?: string;
  readonly category: BudgetCategory;
  readonly required: boolean;
  readonly unitCost: number;
}
export interface SelectionDecision {
  readonly unitCost: number;
  readonly refs: readonly MaterialRef[];
  readonly conflictGroupId?: string;
  readonly status: "selected" | "excluded";
  readonly reason: SelectionReason;
}
export interface SelectionPhase extends SelectionDecision {
  readonly phase: "required" | "category" | "borrow" | "final";
}
export type CategoryAmounts = Readonly<Record<BudgetCategory, number>>;
export interface BudgetSelectionSuccess {
  readonly ok: true;
  readonly rendering: { readonly baseText: string; readonly memoryText: string; readonly fullText: string };
  readonly selectedUnits: readonly SelectionUnit[];
  readonly decisions: readonly SelectionDecision[];
  readonly phaseTrace: readonly SelectionPhase[];
  readonly accounting: {
    /** Quotas, transfers and borrowing describe initial selection, not final exact token shares. */
    readonly initialQuotas: CategoryAmounts;
    readonly requiredQuotas: CategoryAmounts;
    readonly borrowedQuotas: CategoryAmounts;
    readonly emptyCategoryPool: number;
    readonly remainingSharedPool: number;
    readonly transfers: readonly { readonly from: BudgetCategory; readonly to: BudgetCategory; readonly tokens: number }[];
    readonly borrowAllocations: readonly { readonly refs: readonly MaterialRef[]; readonly category: BudgetCategory; readonly ownTokens: number; readonly borrowedTokens: number }[];
    readonly initialSelectedCost: number;
    readonly retainedInitialCost: number;
    readonly removedInitialCost: number;
    readonly finalExactTokens: { readonly memory: number; readonly full: number };
    readonly baseTokens: number;
    readonly memoryBudget: number;
    readonly availableInput: number;
  };
  readonly metadata: {
    readonly budget: BudgetLimits;
    readonly counter: { readonly id: string; readonly version: string; readonly mode: "exact" };
    readonly compilerRevision: typeof COMPILER_REVISION;
    readonly rendererRevision: typeof RENDERER_REVISION;
  };
}
export interface BudgetSelectionFailure {
  readonly ok: false;
  readonly error: "invalid_input" | "budget_conflict" | "token_count_error";
  readonly reason: string;
}
export type BudgetSelectionResult = BudgetSelectionSuccess | BudgetSelectionFailure;

const categories: readonly BudgetCategory[] = ["current", "experience", "open"];
const reverseCategories: readonly BudgetCategory[] = ["open", "experience", "current"];
const headings = ["Task contract", "Working state", "Current knowledge", "Experience/procedure", "Open questions", "Evidence references"] as const;
type Amounts = Record<BudgetCategory, number>;
type InternalUnit = Omit<SelectionUnit, "unitCost"> & { unitCost: number };
class SelectionError {
  readonly error: BudgetSelectionFailure["error"];
  readonly reason: string;
  constructor(error: BudgetSelectionFailure["error"], reason: string) { this.error = error; this.reason = reason; }
}
function fail(error: BudgetSelectionFailure["error"], reason: string): never { throw new SelectionError(error, reason); }
function invalid(reason: string): never { return fail("invalid_input", reason); }
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function natural(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function positive(value: unknown): value is number { return natural(value) && value > 0; }
function safeAdd(a: number, b: number): number {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) invalid("unsafe_arithmetic");
  return sum;
}
function cmpString(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function cmpRef(a: MaterialRef, b: MaterialRef): number { return cmpString(a.id, b.id) || (a.version < b.version ? -1 : a.version > b.version ? 1 : 0); }
function cmpSource(a: SourceRef, b: SourceRef): number { return cmpRef(a, b) || cmpString(a.selector, b.selector); }
function cmpArray<T>(a: readonly T[], b: readonly T[], compare: (a: T, b: T) => number): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) { const order = compare(a[i], b[i]); if (order) return order; }
  return a.length - b.length;
}
function cmpMaterial(a: BudgetMaterial, b: BudgetMaterial): number {
  return (a.priorityOrdinal < b.priorityOrdinal ? -1 : a.priorityOrdinal > b.priorityOrdinal ? 1 : 0) || cmpRef(a, b) || cmpArray(a.sourceRefs, b.sourceRefs, cmpSource);
}
function cmpUnit(a: InternalUnit, b: InternalUnit): number { return cmpMaterial(a.members[0], b.members[0]) || cmpArray(a.refs, b.refs, cmpRef); }
function refKey(ref: MaterialRef): string { return JSON.stringify([ref.id, ref.version]); }
function amounts(): Amounts { return { current: 0, experience: 0, open: 0 }; }
function normalizeRefs(value: unknown, sources: true): SourceRef[];
function normalizeRefs(value: unknown, sources: false): MaterialRef[];
function normalizeRefs(value: unknown, sources: boolean): (SourceRef | MaterialRef)[] {
  if (!Array.isArray(value) || value.length === 0) invalid("invalid_refs");
  const refs = value.map((ref: unknown) => {
    if (!record(ref) || !nonempty(ref.id) || !positive(ref.version) || (sources && !nonempty(ref.selector))) invalid("invalid_refs");
    return sources ? { id: ref.id, version: ref.version, selector: ref.selector as string } : { id: ref.id, version: ref.version };
  });
  const compare = sources ? (a: MaterialRef, b: MaterialRef) => cmpSource(a as SourceRef, b as SourceRef) : cmpRef;
  refs.sort(compare);
  return refs.filter((ref, index) => index === 0 || compare(refs[index - 1], ref) !== 0);
}
function normalize(input: BudgetSelectionInput): { input: BudgetSelectionInput; units: InternalUnit[] } {
  if (!record(input) || !record(input.base) || !record(input.budget) || !record(input.counter) || !Array.isArray(input.materials)) invalid("invalid_structure");
  const base = input.base;
  for (const key of ["constraints", "currentRequest", "acceptanceCriteria", "workingState"] as const) {
    if (!Object.hasOwn(base, key) || typeof base[key] !== "string") invalid("missing_base_block");
  }
  for (const key of ["contextLimit", "reservedOutput", "mandatoryProtocolOverhead"] as const) {
    if (!natural(input.budget[key])) invalid("invalid_budget");
  }
  // Validate the entire numeric/identity boundary before any budget or counter work.
  safeAdd(input.budget.reservedOutput, input.budget.mandatoryProtocolOverhead);
  if (!nonempty(input.counter.id) || !nonempty(input.counter.version) || input.counter.mode !== "exact" || typeof input.counter.count !== "function") invalid("invalid_counter");
  const materials = new Map<string, BudgetMaterial>();
  for (const candidate of input.materials) {
    if (!record(candidate) || !nonempty(candidate.id) || !positive(candidate.version) || typeof candidate.body !== "string" || !categories.includes(candidate.category as BudgetCategory) || typeof candidate.required !== "boolean" || !natural(candidate.priorityOrdinal)) invalid("invalid_material");
    const hasGroup = candidate.conflictGroupId !== undefined;
    if (hasGroup !== (candidate.conflictMembers !== undefined) || (hasGroup && !nonempty(candidate.conflictGroupId))) invalid("invalid_group");
    const material: BudgetMaterial = {
      id: candidate.id, version: candidate.version, body: candidate.body,
      sourceRefs: normalizeRefs(candidate.sourceRefs, true), category: candidate.category as BudgetCategory,
      required: candidate.required, priorityOrdinal: candidate.priorityOrdinal,
      ...(hasGroup ? { conflictGroupId: candidate.conflictGroupId as string, conflictMembers: normalizeRefs(candidate.conflictMembers, false) } : {}),
    };
    const key = refKey(material);
    const prior = materials.get(key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(material)) invalid("conflicting_identity");
    materials.set(key, material);
  }
  const groups = new Map<string, BudgetMaterial[]>();
  const units: InternalUnit[] = [];
  for (const material of materials.values()) {
    if (material.conflictGroupId === undefined) {
      units.push({ members: [material], refs: [{ id: material.id, version: material.version }], category: material.category, required: material.required, unitCost: 0 });
    } else {
      const group = groups.get(material.conflictGroupId) ?? [];
      group.push(material); groups.set(material.conflictGroupId, group);
    }
  }
  for (const [conflictGroupId, members] of groups) {
    const refs = members.map(({ id, version }) => ({ id, version })).sort(cmpRef);
    for (const member of members) {
      if (member.category !== members[0].category || JSON.stringify(member.conflictMembers) !== JSON.stringify(refs)) invalid("incomplete_or_conflicting_group");
    }
    members.sort(cmpMaterial);
    units.push({ members, refs, conflictGroupId, category: members[0].category, required: members.some((member) => member.required), unitCost: 0 });
  }
  units.sort(cmpUnit);
  return { input: {
    base: { constraints: base.constraints, currentRequest: base.currentRequest, acceptanceCriteria: base.acceptanceCriteria, workingState: base.workingState },
    budget: { contextLimit: input.budget.contextLimit, reservedOutput: input.budget.reservedOutput, mandatoryProtocolOverhead: input.budget.mandatoryProtocolOverhead },
    materials: [], counter: input.counter,
  }, units };
}
function bodyFragment(unit: InternalUnit): string {
  return "\n" + JSON.stringify({ unit: unit.refs, conflictGroupId: unit.conflictGroupId ?? null, required: unit.required,
    disputed: unit.conflictGroupId !== undefined || unit.category === "open",
    materials: unit.members.map((m) => ({ id: m.id, version: m.version, required: m.required, body: m.body })) }) + "\n";
}
function evidenceFragment(unit: InternalUnit): string {
  return "\n" + JSON.stringify({ evidence: unit.members.map((m) => ({ id: m.id, version: m.version, sourceRefs: m.sourceRefs })) }) + "\n";
}
function render(base: BudgetSelectionInput["base"], units: readonly InternalUnit[]): { baseText: string; memoryText: string; fullText: string } {
  const ordered = categories.flatMap((category) => units.filter((unit) => unit.category === category).sort(cmpUnit));
  const fragments = ["", "", ...categories.map((category) => ordered.filter((unit) => unit.category === category).map(bodyFragment).join("")), ordered.map(evidenceFragment).join("")];
  const fixed = [
    JSON.stringify({ constraints: base.constraints, currentRequest: base.currentRequest, acceptanceCriteria: base.acceptanceCriteria }) + "\n",
    JSON.stringify({ required: true, workingState: base.workingState }) + "\n", "", "", "", "",
  ];
  const section = (index: number) => `## ${headings[index]}\n${fixed[index]}`;
  return { baseText: headings.map((_, i) => section(i)).join(""), memoryText: fragments.join(""), fullText: headings.map((_, i) => section(i) + fragments[i]).join("") };
}
function createCounter(counter: ExactTokenCounter): (text: string) => number {
  const observed = new Map<string, number>();
  return (text) => {
    let count: number;
    try { count = counter.count(text); } catch { return fail("token_count_error", "counter_failed"); }
    if (!natural(count) || (text === "" && count !== 0)) fail("token_count_error", "invalid_count");
    const prior = observed.get(text);
    if (prior !== undefined && prior !== count) fail("token_count_error", "inconsistent_count");
    observed.set(text, count);
    return count;
  };
}
function quotas(budget: number): Amounts {
  // memoryBudget is capped at 4096; quotient/remainder arithmetic is safe regardless.
  const weights = [60, 25, 15];
  const result = amounts();
  const remainder = categories.map((category, index) => {
    const smallProduct = (budget % 100) * weights[index];
    result[category] = Math.floor(budget / 100) * weights[index] + Math.floor(smallProduct / 100);
    return { category, remainder: smallProduct % 100, index };
  }).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  let left = budget - categories.reduce((sum, category) => sum + result[category], 0);
  for (const item of remainder) { if (left-- <= 0) break; result[item.category]++; }
  return result;
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function selectContextBudget(rawInput: BudgetSelectionInput): BudgetSelectionResult {
  try {
    const { input, units } = normalize(rawInput);
    const { budget, counter, base } = input;
    const availableInput = budget.contextLimit - safeAdd(budget.reservedOutput, budget.mandatoryProtocolOverhead);
    if (!Number.isSafeInteger(availableInput)) invalid("unsafe_arithmetic");
    if (availableInput < 0) fail("budget_conflict", "negative_available_input");
    const count = createCounter(counter);
    count("");
    const baseRendering = render(base, []);
    const baseTokens = count(baseRendering.baseText);
    if (baseTokens > availableInput) fail("budget_conflict", "base_exceeds_budget");
    const memoryBudget = Math.min(4096, Math.floor(availableInput / 4), availableInput - baseTokens);
    const requiredCosts = amounts();
    let requiredTotal = 0;
    // Cost required first so optional counting cannot mask a required-budget conflict.
    for (const unit of units.filter((unit) => unit.required)) {
      unit.unitCost = count(bodyFragment(unit) + evidenceFragment(unit));
      requiredCosts[unit.category] = safeAdd(requiredCosts[unit.category], unit.unitCost);
      requiredTotal = safeAdd(requiredTotal, unit.unitCost);
    }
    if (requiredTotal > memoryBudget) fail("budget_conflict", "required_exceeds_budget");
    for (const unit of units.filter((unit) => !unit.required)) unit.unitCost = count(bodyFragment(unit) + evidenceFragment(unit));
    const initialQuotas = quotas(memoryBudget);
    const requiredQuotas = { ...initialQuotas };
    const transfers: { from: BudgetCategory; to: BudgetCategory; tokens: number }[] = [];
    for (const to of categories) {
      let needed = Math.max(0, requiredCosts[to] - requiredQuotas[to]);
      for (const from of reverseCategories) {
        if (from === to || needed === 0) continue;
        const tokens = Math.min(needed, Math.max(0, requiredQuotas[from] - requiredCosts[from]));
        if (tokens) { requiredQuotas[from] -= tokens; requiredQuotas[to] += tokens; needed -= tokens; transfers.push({ from, to, tokens }); }
      }
    }
    const borrowedQuotas = { ...requiredQuotas };
    const remaining = amounts();
    let pool = 0;
    for (const category of categories) {
      remaining[category] = requiredQuotas[category] - requiredCosts[category];
      if (!units.some((unit) => unit.category === category)) {
        pool += remaining[category]; remaining[category] = 0; borrowedQuotas[category] = 0;
      }
    }
    const emptyCategoryPool = pool;
    const selected = new Set<InternalUnit>();
    const finalDecisions = new Map<InternalUnit, SelectionDecision>();
    const phaseTrace: SelectionPhase[] = [];
    const borrowAllocations: { refs: readonly MaterialRef[]; category: BudgetCategory; ownTokens: number; borrowedTokens: number }[] = [];
    const decide = (unit: InternalUnit, status: SelectionDecision["status"], reason: SelectionReason, phase: SelectionPhase["phase"]) => {
      const decision: SelectionDecision = { unitCost: unit.unitCost, refs: unit.refs, ...(unit.conflictGroupId === undefined ? {} : { conflictGroupId: unit.conflictGroupId }), status, reason };
      finalDecisions.set(unit, decision); phaseTrace.push({ ...decision, phase });
    };
    let initialSelectedCost = requiredTotal;
    for (const unit of units.filter((unit) => unit.required)) { selected.add(unit); decide(unit, "selected", "required", "required"); }
    for (const category of categories) {
      for (const unit of units.filter((unit) => !unit.required && unit.category === category)) {
        if (unit.unitCost > memoryBudget - initialSelectedCost) decide(unit, "excluded", "memory_budget", "category");
        else if (unit.unitCost > remaining[category]) decide(unit, "excluded", "category_budget", "category");
        else { selected.add(unit); remaining[category] -= unit.unitCost; initialSelectedCost += unit.unitCost; decide(unit, "selected", "selected_by_category", "category"); }
      }
    }
    if (pool > 0) {
      for (const unit of units.filter((unit) => !unit.required && !selected.has(unit))) {
        const ownTokens = Math.min(remaining[unit.category], unit.unitCost);
        const borrowedTokens = unit.unitCost - ownTokens;
        if (unit.unitCost > memoryBudget - initialSelectedCost) decide(unit, "excluded", "memory_budget", "borrow");
        else if (borrowedTokens > pool) decide(unit, "excluded", "category_budget", "borrow");
        else {
          selected.add(unit); remaining[unit.category] -= ownTokens; pool -= borrowedTokens;
          borrowedQuotas[unit.category] += borrowedTokens; initialSelectedCost += unit.unitCost;
          borrowAllocations.push({ refs: unit.refs, category: unit.category, ownTokens, borrowedTokens });
          decide(unit, "selected", "selected_by_borrow", "borrow");
        }
      }
    }
    let rendering = render(base, [...selected]);
    let memory = count(rendering.memoryText);
    let full = count(rendering.fullText);
    let removedInitialCost = 0;
    const removable = [...selected].filter((unit) => !unit.required).sort(cmpUnit).reverse();
    while (memory > memoryBudget || full > availableInput) {
      const unit = removable.shift();
      if (!unit) fail("budget_conflict", "required_final_exceeds_budget");
      selected.delete(unit); removedInitialCost = safeAdd(removedInitialCost, unit.unitCost);
      decide(unit, "excluded", "final_budget", "final");
      rendering = render(base, [...selected]);
      memory = count(rendering.memoryText); full = count(rendering.fullText);
    }
    // Every object below was copied during normalization or created within this call.
    return deepFreeze({
      ok: true, rendering,
      selectedUnits: categories.flatMap((category) => units.filter((unit) => selected.has(unit) && unit.category === category)),
      decisions: units.map((unit) => finalDecisions.get(unit)!), phaseTrace,
      accounting: { initialQuotas, requiredQuotas, borrowedQuotas, emptyCategoryPool, remainingSharedPool: pool, transfers, borrowAllocations,
        initialSelectedCost, retainedInitialCost: initialSelectedCost - removedInitialCost, removedInitialCost,
        finalExactTokens: { memory, full }, baseTokens, memoryBudget, availableInput },
      metadata: { budget: { ...budget }, counter: { id: counter.id, version: counter.version, mode: "exact" }, compilerRevision: COMPILER_REVISION, rendererRevision: RENDERER_REVISION },
    } as BudgetSelectionSuccess);
  } catch (error) {
    if (error instanceof SelectionError) {
      // Multiple invalid fields must not expose which candidate was visited first.
      return deepFreeze({ ok: false, error: error.error, reason: error.error === "invalid_input" ? "invalid_input" : error.reason });
    }
    // Malformed host values (e.g. throwing property accessors) do not leak arbitrary messages.
    return deepFreeze({ ok: false, error: "invalid_input", reason: "invalid_input" });
  }
}
