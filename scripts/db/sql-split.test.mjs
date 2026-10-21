import { describe, expect, it } from "vitest";

import { isNoTransaction, splitStatements } from "./sql-split.mjs";

describe("splitStatements", () => {
  it("splits plain statements on semicolons", () => {
    const out = splitStatements("create table a (id int);\ncreate table b (id int);");
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("create table a");
    expect(out[1]).toContain("create table b");
  });

  it("keeps a dollar-quoted function body intact", () => {
    const sql = `create index concurrently if not exists x on t (a);

create or replace function public.f(_ids uuid[])
returns void language sql as $$
  update t set n = u.ord from unnest(_ids) as u(id, ord) where t.id = u.id;
$$;

grant execute on function public.f(uuid[]) to authenticated;`;
    const out = splitStatements(sql);
    expect(out).toHaveLength(3);
    expect(out[1]).toContain("$$");
    expect(out[1]).toContain("update t set n = u.ord");
    expect(out[2]).toContain("grant execute");
  });

  it("does not split on a semicolon inside a string literal", () => {
    const out = splitStatements("insert into t (x) values ('a;b');\nselect 1;");
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("'a;b'");
  });

  it("handles escaped single quotes", () => {
    const out = splitStatements("select 'it''s fine; really';");
    expect(out).toHaveLength(1);
  });

  it("ignores semicolons inside line comments", () => {
    const out = splitStatements("-- drop this; later\nselect 1;");
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("select 1");
  });

  it("drops comment-only chunks", () => {
    const out = splitStatements("-- just a comment;\n\nselect 1;");
    expect(out).toHaveLength(1);
  });
});

describe("isNoTransaction", () => {
  it("detects the directive in the file header", () => {
    expect(isNoTransaction("-- migrate:no-transaction\ncreate index concurrently x;")).toBe(true);
  });

  it("is false when absent", () => {
    expect(isNoTransaction("-- a normal migration\ncreate table t (id int);")).toBe(false);
  });
});
