import type { FixtureContext } from "./normalized-runtime-event-v1.fixture-context.ts";
import { append_failure_cancel_fixture } from "./normalized-runtime-event-v1.fixture-failure-cancel.ts";
import { append_failure_exhausted_fixture } from "./normalized-runtime-event-v1.fixture-failure-exhausted.ts";
import { append_failure_preflight_fixture } from "./normalized-runtime-event-v1.fixture-failure-preflight.ts";

export function append_failure_fixture(context: FixtureContext): void {
  append_failure_preflight_fixture(context);
  append_failure_cancel_fixture(context);
  append_failure_exhausted_fixture(context);
}
