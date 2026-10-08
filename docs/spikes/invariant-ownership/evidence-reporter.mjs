// Preserve source identity and per-file counts; a runner file wrapper is not
// evidence of a named test, even when Node reports it as a passing "test".
export default async function* report(source) {
  for await (const event of source) {
    if (event.type === "test:pass" || event.type === "test:fail") {
      yield JSON.stringify({ type: event.type, name: event.data.name,
        testType: event.data.details?.type, file: event.data.file,
        line: event.data.line, column: event.data.column,
        skip: Boolean(event.data.skip), todo: Boolean(event.data.todo) }) + "\n";
    } else if (event.type === "test:summary" && event.data.file) {
      yield JSON.stringify({ type: event.type, file: event.data.file,
        success: event.data.success, counts: event.data.counts }) + "\n";
    }
  }
}
