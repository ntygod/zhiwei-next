import type { FixtureContext } from "./normalized-runtime-event-v1.fixture-context.ts";
import { append_primary_command_fixture } from "./normalized-runtime-event-v1.fixture-primary-command.ts";
import { append_primary_tail_fixture } from "./normalized-runtime-event-v1.fixture-primary-tail.ts";
import { append_primary_tool_fixture } from "./normalized-runtime-event-v1.fixture-primary-tools.ts";

export function append_primary_fixture(context: FixtureContext): void {
  const messageEnd = append_primary_command_fixture(context);
  append_primary_tool_fixture(context);
  append_primary_tail_fixture(context, messageEnd);
}
