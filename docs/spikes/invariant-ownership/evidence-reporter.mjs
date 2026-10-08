// Small node:test reporter for exact executed-name verification in this Spike.
export default async function* report(source) {
  for await (const event of source) {
    if (event.type === "test:pass" || event.type === "test:fail") {
      yield JSON.stringify({ type: event.type, name: event.data.name,
        skip: Boolean(event.data.skip), todo: Boolean(event.data.todo) }) + "\n";
    }
  }
}
