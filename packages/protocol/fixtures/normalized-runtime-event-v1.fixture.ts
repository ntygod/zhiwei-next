import type { NormalizedRuntimeEventV1 } from "../src/index.ts";
import {
  createFixtureContext,
  NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE,
} from "./normalized-runtime-event-v1.fixture-context.ts";
import { append_primary_fixture } from "./normalized-runtime-event-v1.fixture-primary.ts";
import { append_failure_fixture } from "./normalized-runtime-event-v1.fixture-failure.ts";
import { append_retry_success_fixture } from "./normalized-runtime-event-v1.fixture-retry-success.ts";
import { append_replacement_fixture } from "./normalized-runtime-event-v1.fixture-replacement.ts";

export { NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE };

export function buildNormalizedRuntimeEventV1Fixture(): readonly NormalizedRuntimeEventV1[] {
  const context = createFixtureContext();
  append_primary_fixture(context);
  append_failure_fixture(context);
  append_retry_success_fixture(context);
  append_replacement_fixture(context);
  return context.events;
}
