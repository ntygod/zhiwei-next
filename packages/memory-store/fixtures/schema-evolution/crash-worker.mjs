// Abrupt-process experiment only. OS/page-cache power loss is not simulated.
import assert from "node:assert/strict";
import { candidateSql, connectCandidate, upgrade } from "./candidate.mjs";
const [filePath, phase] = process.argv.slice(2);
assert.ok(["after-ddl", "after-history", "after-validation", "after-commit"].includes(phase));
const database = connectCandidate(filePath);
const exec = database.exec.bind(database);
if (phase === "after-ddl") database.exec = (sql) => {
  const result = exec(sql);
  if (sql === candidateSql) process.exit(73);
  return result;
};
if (phase === "after-history") {
  const prepare = database.prepare.bind(database);
  database.prepare = (sql) => {
    const statement = prepare(sql);
    if (sql.includes("INSERT INTO schema_migrations")) {
      const run = statement.run.bind(statement);
      statement.run = (...args) => { run(...args); process.exit(73); };
    }
    return statement;
  };
}
upgrade(database, { afterValidation: () => {
  if (phase === "after-validation") process.exit(73);
} });
if (phase === "after-commit") process.exit(73);
throw new Error(`Fault phase did not run: ${phase}`);
