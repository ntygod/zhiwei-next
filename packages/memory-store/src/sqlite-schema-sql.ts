/**
 * Tokenizes SQLite Schema SQL while preserving every quoted token byte-for-byte.
 *
 * Outside quoted strings/identifiers, keyword case and comments/whitespace are
 * non-semantic and are normalized. This prevents manifest checks from treating
 * `'sdk'` and `'SDK'`, or different RAISE() literals, as equivalent.
 */

export type SqlSchemaTokenKind = "word" | "quoted" | "punctuation";

export interface SqlSchemaToken {
  readonly kind: SqlSchemaTokenKind;
  readonly value: string;
}

const PUNCTUATION = new Set(
  Array.from("(),;=<>+-*/%|&~.!?:"),
);

function readQuotedToken(sql: string, start: number): number {
  const opener = sql[start];
  const closer = opener === "[" ? "]" : opener;
  let index = start + 1;

  while (index < sql.length) {
    const current = sql[index];
    if (current === closer) {
      if (sql[index + 1] === closer) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }

  throw new Error(`Unterminated quoted SQL token starting at offset ${start}.`);
}

export function tokenizeSqlSchema(sql: string): readonly SqlSchemaToken[] {
  const tokens: SqlSchemaToken[] = [];
  let index = 0;

  while (index < sql.length) {
    const current = sql[index];

    if (/\s/u.test(current)) {
      index += 1;
      continue;
    }

    if (current === "-" && sql[index + 1] === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }

    if (current === "/" && sql[index + 1] === "*") {
      const end = sql.indexOf("*/", index + 2);
      if (end < 0) {
        throw new Error(`Unterminated SQL block comment starting at offset ${index}.`);
      }
      index = end + 2;
      continue;
    }

    if (
      current === "'" ||
      current === '"' ||
      current === "`" ||
      current === "["
    ) {
      const end = readQuotedToken(sql, index);
      tokens.push({ kind: "quoted", value: sql.slice(index, end) });
      index = end;
      continue;
    }

    if (PUNCTUATION.has(current)) {
      tokens.push({ kind: "punctuation", value: current });
      index += 1;
      continue;
    }

    const start = index;
    while (index < sql.length) {
      const value = sql[index];
      if (
        /\s/u.test(value) ||
        value === "'" ||
        value === '"' ||
        value === "`" ||
        value === "[" ||
        PUNCTUATION.has(value) ||
        (value === "-" && sql[index + 1] === "-") ||
        (value === "/" && sql[index + 1] === "*")
      ) {
        break;
      }
      index += 1;
    }
    if (index === start) {
      throw new Error(`Unable to tokenize SQL at offset ${index}.`);
    }
    tokens.push({
      kind: "word",
      value: sql.slice(start, index).toLowerCase(),
    });
  }

  return tokens;
}

export function normalizeSqlSchemaSignature(sql: string | null): string {
  if (sql === null) return "<null>";
  return JSON.stringify(tokenizeSqlSchema(sql));
}

export function sqlStatementLeadingKeywords(sql: string): readonly string[] {
  const leaders: string[] = [];
  let atStatementStart = true;

  for (const token of tokenizeSqlSchema(sql)) {
    if (token.kind === "punctuation" && token.value === ";") {
      atStatementStart = true;
      continue;
    }
    if (!atStatementStart) continue;
    if (token.kind === "word") {
      leaders.push(token.value);
      atStatementStart = false;
    }
  }

  return leaders;
}
