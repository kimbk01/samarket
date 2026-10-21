import { describe, expect, it } from "vitest";
import {
  applyMigrationSql,
  buildManifest,
  compareSchema,
  emptyState,
  normalizeArgSignature,
  splitStatements,
  unwrapSnapshot,
} from "../../../scripts/prod-schema-drift/lib.mjs";

describe("FIN-10 prod-schema-drift · parser", () => {
  it("splitStatements strips comments/strings and captures dollar bodies", () => {
    const st = splitStatements("-- c;\nselect 'a;b'; /* x; */ do $x$ begin null; end $x$;");
    expect(st.map((s) => s.text)).toEqual(["select ''", "do  $body0$"]);
    expect(st[1].bodies[0]).toContain("begin null;");
  });

  it("CREATE TABLE column list skips constraints; non-public ignored", () => {
    const m = buildManifest([
      {
        name: "001.sql",
        sql: `CREATE TABLE IF NOT EXISTS public.t (
          id uuid primary key default gen_random_uuid(),
          "Name" text,
          amount numeric(10, 2) check (amount > 0),
          constraint t_u unique (id, "Name"),
          primary key (id)
        );
        create table auth.x (a int);
        create table bare (b int);`,
      },
    ]);
    expect(m.tables).toEqual({ bare: ["b"], t: ["Name", "amount", "id"] });
  });

  it("CREATE TABLE IF NOT EXISTS on an existing table is a no-op", () => {
    const m = buildManifest([
      { name: "1.sql", sql: "create table public.a (x int);" },
      { name: "2.sql", sql: "create table if not exists public.a (x int, y int);" },
    ]);
    expect(m.tables.a).toEqual(["x"]);
  });

  it("ALTER TABLE add/drop/rename column, rename table, drop table — file order", () => {
    const m = buildManifest([
      { name: "3.sql", sql: "alter table public.r rename column c to d; alter table public.r rename to s;" },
      {
        name: "1.sql",
        sql: "create table public.r (a int, b int); create table public.gone (z int);",
      },
      {
        name: "2.sql",
        sql: `ALTER TABLE ONLY public.r ADD COLUMN IF NOT EXISTS c text,
                ADD CONSTRAINT r_c CHECK (c <> ''), ADD e int, DROP COLUMN IF EXISTS b, DROP CONSTRAINT foo;
              drop table if exists public.gone cascade;`,
      },
    ]);
    expect(m.tables).toEqual({ s: ["a", "d", "e"] });
  });

  it("DO block bodies are parsed; function bodies are not", () => {
    const m = buildManifest([
      {
        name: "1.sql",
        sql: `create table public.k (id int);
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE column_name = 'v') THEN
            ALTER TABLE public.k ADD COLUMN v text;
          END IF;
        END $$;
        create or replace function public.f(p_id uuid) returns void language plpgsql as $fn$
        begin alter table public.k add column should_not text; end $fn$;`,
      },
    ]);
    expect(m.tables.k).toEqual(["id", "v"]);
    expect(m.functions).toEqual(["f"]);
  });

  it("DROP FUNCTION removes only the matching overload (types-only signature)", () => {
    const state = emptyState();
    applyMigrationSql(
      state,
      `create function public.g(p_a uuid, p_b int default 1) returns int as $$ select 1 $$ language sql;
       create function public.g(p_a uuid) returns int as $$ select 1 $$ language sql;
       create function public.h() returns int as $$ select 1 $$ language sql;
       drop function if exists public.g(uuid, integer);
       drop function public.h;`,
    );
    expect([...state.functions.keys()]).toEqual(["g"]);
    expect([...(state.functions.get("g") ?? [])]).toEqual(["uuid"]);
    expect(normalizeArgSignature("p_x timestamptz, out p_y character varying(20), VARIADIC p_z text[]")).toBe(
      "timestamp with time zone,character varying,text[]",
    );
  });
});

describe("FIN-10 prod-schema-drift · compare", () => {
  const manifest = {
    tables: { a: ["id", "x"], b: ["id"] },
    functions: ["f", "g"],
  };
  const snapshot = { columns: { a: ["id", "extra"], v: ["k"] }, functions: ["f", "zz"] };

  it("reports missing tables/columns/functions and prod-only extras", () => {
    const r = compareSchema(manifest, snapshot);
    expect(r.missingTables).toEqual(["b"]);
    expect(r.missingColumns).toEqual(["a.x"]);
    expect(r.missingFunctions).toEqual(["g()"]);
    expect(r.extra).toEqual({ tables: ["v"], columns: ["a.extra"], functions: ["zz"] });
    expect(r.ok).toBe(false);
    expect(r.blocking).toEqual(["b", "a.x", "g()"]);
  });

  it("allowlist entries do not block", () => {
    const r = compareSchema(manifest, snapshot, {
      entries: [
        { object: "b", reason: "r" },
        { object: "a.x", reason: "r" },
        { object: "g()", reason: "r" },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.allowedMissing.map((a) => a.object)).toEqual(["b", "a.x", "g()"]);
  });

  it("unwrapSnapshot accepts raw SQL rows and wrapped files", () => {
    expect(unwrapSnapshot([{ snapshot: snapshot }])).toBe(snapshot);
    expect(unwrapSnapshot({ snapshot })).toBe(snapshot);
    expect(unwrapSnapshot(snapshot)).toBe(snapshot);
  });
});
