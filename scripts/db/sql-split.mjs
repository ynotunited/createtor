/**
 * Minimal SQL statement splitter.
 *
 * `create index concurrently` (and every other statement that cannot run inside
 * a transaction) must be sent to Postgres one statement at a time, so the runner
 * needs to split a migration file into statements. A naive `split(";")` corrupts
 * PL/pgSQL bodies (`$$ ... $$`) and any semicolon inside a string literal, so
 * this scanner tracks dollar-quoted blocks, single-quoted strings (including the
 * `''` escape), and line comments.
 *
 * It intentionally does not handle block comments or double-quoted identifiers:
 * none of the migration files use them.
 */
export function splitStatements(sql) {
  const statements = [];
  let buffer = "";
  let index = 0;
  let dollarTag = null;
  let inSingle = false;
  let inLineComment = false;

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed.length > 0) statements.push(trimmed);
    buffer = "";
  };

  while (index < sql.length) {
    const char = sql[index];
    const rest = sql.slice(index);

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      buffer += char;
      index += 1;
      continue;
    }

    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        buffer += dollarTag;
        index += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buffer += char;
      index += 1;
      continue;
    }

    if (inSingle) {
      if (char === "'") {
        if (sql[index + 1] === "'") {
          buffer += "''";
          index += 2;
          continue;
        }
        inSingle = false;
      }
      buffer += char;
      index += 1;
      continue;
    }

    if (char === "'") {
      inSingle = true;
      buffer += char;
      index += 1;
      continue;
    }

    if (char === "-" && sql[index + 1] === "-") {
      inLineComment = true;
      buffer += char;
      index += 1;
      continue;
    }

    if (char === "$") {
      const match = /^\$[A-Za-z0-9_]*\$/.exec(rest);
      if (match) {
        dollarTag = match[0];
        buffer += dollarTag;
        index += dollarTag.length;
        continue;
      }
    }

    if (char === ";") {
      flush();
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();

  // Drop statement chunks that are only comments/whitespace.
  return statements.filter((statement) => statement.replace(/--[^\n]*/g, "").trim().length > 0);
}

/** True when a migration opts out of the wrapping transaction. */
export function isNoTransaction(sql) {
  const header = sql.split("\n").slice(0, 20).join("\n");
  return /--\s*migrate:no-transaction\b/.test(header);
}
