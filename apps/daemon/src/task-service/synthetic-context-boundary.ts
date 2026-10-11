import { compileCognitiveContextV1 } from "../../../../packages/context-compiler/src/index.ts";
import { canonicalJsonV1 } from "../../../../packages/protocol/src/index.ts";
import type { ContextPersistenceBoundaryV1 } from "../../../../packages/memory-store/src/index.ts";

/** Exact only for this synthetic scalar-count profile; it is not a Provider tokenizer. */
export const syntheticContextCounterV1 = Object.freeze({ id: "synthetic-unicode-scalar-v1", version: "1", mode: "exact" as const,
  count: (text: string) => [...text].length });
export const syntheticContextBoundaryV1: ContextPersistenceBoundaryV1 = Object.freeze({
  budget: Object.freeze({ contextLimit: 32768, reservedOutput: 4096, mandatoryProtocolOverhead: 4096 }),
  counter: Object.freeze({ id: syntheticContextCounterV1.id, version: syntheticContextCounterV1.version, mode: "exact" as const }),
  compile: (input: Parameters<ContextPersistenceBoundaryV1["compile"]>[0]) => compileCognitiveContextV1({ ...input, scope: { kind: "workspace", workspaceId: input.task.workspaceId },
    budget: syntheticContextBoundaryV1.budget, counter: syntheticContextCounterV1 }),
  countActualRequest: (context: Parameters<ContextPersistenceBoundaryV1["countActualRequest"]>[0]) => syntheticContextCounterV1.count(canonicalJsonV1(context)),
});
