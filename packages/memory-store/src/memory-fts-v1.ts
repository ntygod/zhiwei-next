import { DatabaseSync } from "node:sqlite";
import { configureCognitiveDatabaseV2 } from "./cognitive-schema-v2.ts";

export interface MemorySearchTextV1 { readonly id: string; readonly version: number; readonly statement: string }
export interface MemoryTextRankV1 { readonly id: string; readonly version: number; readonly score: number }
export interface MemoryTextSearchV1 {
  readonly method: "fts5-trigram" | "scoped-short-query";
  readonly rows: readonly MemoryTextRankV1[];
}

/** Request-local derived index. Only already-qualified material is inserted, and
 * no index file, model request, source body or authority is produced. */
export function rankMemoryTextsV1(material: readonly MemorySearchTextV1[], query: string, limit: number): MemoryTextSearchV1 {
  const normalized = query.trim().toLocaleLowerCase("en-US");
  if (Array.from(normalized).length < 3) {
    return { method: "scoped-short-query", rows: material.filter(item => item.statement.toLocaleLowerCase("en-US").includes(normalized))
      .sort((a, b) => a.id.localeCompare(b.id, "en-US") || a.version - b.version)
      .slice(0, limit).map(item => ({ id: item.id, version: item.version, score: 0 })) };
  }
  const database = new DatabaseSync(":memory:");
  try {
    configureCognitiveDatabaseV2(database, { filePath: ":memory:", busyTimeoutMs: 5000 });
    database.exec("CREATE VIRTUAL TABLE memory_text USING fts5(id UNINDEXED,version UNINDEXED,statement,tokenize='trigram')");
    const insert = database.prepare("INSERT INTO memory_text(id,version,statement) VALUES(?,?,?)");
    database.exec("BEGIN");
    for (const item of material) insert.run(item.id, item.version, item.statement);
    database.exec("COMMIT");
    // A search term is a literal phrase, not caller-supplied FTS operators.
    const phrase = `"${query.trim().replaceAll('"', '""')}"`;
    const rows = database.prepare("SELECT id,version,bm25(memory_text) AS score FROM memory_text WHERE memory_text MATCH ? ORDER BY score,id,CAST(version AS INTEGER) LIMIT ?")
      .all(phrase, limit).map(row => ({ id: String(row.id), version: Number(row.version), score: Number(row.score) }));
    return { method: "fts5-trigram", rows };
  } finally { database.close(); }
}
