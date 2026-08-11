export interface ScenarioStep {
  readonly given: string;
  readonly when: string;
  readonly then: string;
}

export interface CognitionScenario {
  readonly id: string;
  readonly title: string;
  readonly milestone: string;
  readonly invariant: string;
  readonly steps: readonly ScenarioStep[];
}

export function defineScenario(scenario: CognitionScenario): CognitionScenario {
  if (scenario.id.trim().length === 0) throw new Error("scenario id is required");
  if (scenario.steps.length === 0) throw new Error("a scenario needs at least one step");
  return Object.freeze({ ...scenario, steps: Object.freeze([...scenario.steps]) });
}
