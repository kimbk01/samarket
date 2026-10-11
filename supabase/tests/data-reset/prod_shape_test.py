#!/usr/bin/env python3
"""Run the full data reset flow against the real DIBAY table/PK/FK graph rebuilt locally (no real rows).

Input: a schema-shape file (one line per object, produced read-only from pg_catalog):
  T|table|col:type,...|pkcols      U|table|cols      F|table|cols|schema.parent|parentcols|deltype
Seeds 3 synthetic rows per table: row 0 owned by a TESTER, row 1 by a real (unclassified) member,
row 2 with no owner. Then: window → plan → confirm → approve → batches → storage → auth → finish.
Invariants checked:
  * every row that mentions the real member's id is still present,
  * KEEP / LEGAL_HOLD / UNRESOLVED / holdAll tables have the same row count,
  * verify() reports no issues, and the window is re-locked.
Usage: python3 prod_shape_test.py <shape.txt> <manifest.json>   (PGHOST/PGPORT of a throwaway cluster)
"""
import json
import os
import subprocess
import sys
import uuid
from collections import defaultdict

SHAPE, MANIFEST = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../../.."))
DB = "drprod"
TESTER = "b1000000-0000-0000-0000-000000000001"
REAL = "c1000000-0000-0000-0000-000000000001"
A1 = "a1000000-0000-0000-0000-000000000001"
A2 = "a1000000-0000-0000-0000-000000000002"
TYPES = {"u": "uuid", "t": "text", "b": "bigint", "i": "integer", "z": "timestamptz", "v": "varchar",
         "d": "date", "s": "smallint", "j": "jsonb"}
DEL = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}


def psql(sql, db=DB, role=None, check=True):
    if role:
        sql = f"set role {role}; " + sql
    p = subprocess.run(["psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-d", db, "-c", sql],
                       capture_output=True, text=True)
    if check and p.returncode != 0:
        raise SystemExit(f"SQL failed: {p.stderr.strip()}\n{sql[:400]}")
    return p.stdout.strip()


def psql_file(path, db=DB):
    p = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db, "-f", path], capture_output=True, text=True)
    if p.returncode != 0:
        raise SystemExit(f"apply failed {path}: {p.stderr.strip()[:2000]}")


tables, uniques, fks = {}, [], []
for line in open(SHAPE).read().split("\n"):
    parts = line.split("|")
    if parts[0] == "T":
        cols = []
        for c in [x for x in parts[2].split(",") if x]:
            n, ty = c.split(":", 1)
            cols.append((n, TYPES.get(ty, ty)))
        tables[parts[1]] = {"cols": cols, "pk": [x for x in parts[3].split(",") if x]}
    elif parts[0] == "U":
        uniques.append((parts[1], parts[2].split(",")))
    elif parts[0] == "F":
        fks.append({"t": parts[1], "cols": parts[2].split(","), "parent": parts[3], "pcols": parts[4].split(","), "del": parts[5]})

ddl = []
for t, d in tables.items():
    defs = [f'"{n}" {ty}' for n, ty in d["cols"]]
    if d["pk"]:
        defs.append("PRIMARY KEY (" + ", ".join(f'"{c}"' for c in d["pk"]) + ")")
    ddl.append(f'CREATE TABLE public."{t}" ({", ".join(defs)});')
for t, cols in uniques:
    ddl.append(f'ALTER TABLE public."{t}" ADD UNIQUE (' + ", ".join(f'"{c}"' for c in cols) + ");")
for f in fks:
    sch, par = f["parent"].split(".")
    ddl.append(f'ALTER TABLE public."{f["t"]}" ADD FOREIGN KEY (' + ", ".join(f'"{c}"' for c in f["cols"]) +
               f') REFERENCES {sch}."{par}" (' + ", ".join(f'"{c}"' for c in f["pcols"]) + f') ON DELETE {DEL[f["del"]]};')

# ---- synthetic rows ------------------------------------------------------------------------------
fk_by_table = defaultdict(list)
for f in fks:
    fk_by_table[f["t"]].append(f)
order, seen, visiting = [], set(), set()


def visit(t):
    if t in seen or t in visiting:
        return
    visiting.add(t)
    for f in fk_by_table[t]:
        sch, par = f["parent"].split(".")
        if sch == "public" and par != t:
            visit(par)
    visiting.discard(t)
    seen.add(t)
    order.append(t)


for t in sorted(tables):
    visit(t)

OWNER_NAMES = {"user_id", "owner_id", "seller_id", "buyer_id", "sender_id", "peer_id", "reporter_id", "reviewer_id", "reviewee_id"}


def is_owner_like(col, ty):
    if ty != "uuid":
        return False
    import re
    if re.search(r"(_by$|_by_|(^|_)(admin|actor)(_|$))", col):
        return False
    return col in OWNER_NAMES or col.endswith("_user_id") or col.endswith("_buyer_id")


rows = defaultdict(list)
inserts = []
counter = [1000]
for t in order:
    d = tables[t]
    tys = dict(d["cols"])
    for i in range(3):
        owner = [TESTER, REAL, None][i]
        vals = {}
        for f in fk_by_table[t]:
            sch, par = f["parent"].split(".")
            if sch == "auth":
                for c in f["cols"]:
                    vals[c] = owner
                continue
            if par == t or not rows[par] or i >= len(rows[par]):
                for c in f["cols"]:
                    vals.setdefault(c, None)
                continue
            prow = rows[par][i]
            for c, pc in zip(f["cols"], f["pcols"]):
                if c not in vals or vals[c] is None:
                    vals[c] = prow.get(pc)
        for n, ty in d["cols"]:
            if n in vals:
                continue
            if is_owner_like(n, ty):
                vals[n] = owner
            elif ty == "uuid":
                vals[n] = str(uuid.uuid4())
            elif ty in ("text", "varchar"):
                vals[n] = f"v{counter[0]}"
            elif ty in ("integer", "bigint", "smallint"):
                vals[n] = counter[0] % 30000
            elif ty == "date":
                vals[n] = "2026-01-01"
            elif ty == "timestamptz":
                vals[n] = "2026-01-01T00:00:00Z"
            elif ty == "jsonb":
                vals[n] = "{}"
            elif ty.endswith("[]"):
                vals[n] = "{}"
            else:
                vals[n] = None
            counter[0] += 1
        # text owner columns listed in the manifest (e.g. favorite_audit_log.user_id)
        for n, ty in d["cols"]:
            if ty == "text" and n == "user_id":
                vals[n] = owner
        if any(vals.get(c) is None for c in d["pk"]):
            continue
        if t == "profiles" and owner is None:
            continue
        rows[t].append(vals)
        cols = [n for n, _ in d["cols"]]

        def lit(v):
            return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"
        inserts.append(f'INSERT INTO public."{t}" (' + ", ".join(f'"{c}"' for c in cols) + ") VALUES (" +
                       ", ".join(lit(vals[c]) for c in cols) + ") ON CONFLICT DO NOTHING;")

# ---- build database ------------------------------------------------------------------------------
psql(f"drop database if exists {DB}", db="postgres")
psql(f"create database {DB}", db="postgres")
psql_file(os.path.join(HERE, "00_supabase_stubs.sql"))
psql(f"""insert into auth.users (id, email, raw_user_meta_data) values
  ('{TESTER}', 't@x', '{{"p0_r4_qa":"true"}}'), ('{REAL}', 'r@x', '{{}}'), ('{A1}', 'a1@x', '{{}}'), ('{A2}', 'a2@x', '{{}}')""")
tmp = f"/tmp/drprod_{os.getpid()}.sql"
ddl.append('ALTER TABLE public.admin_memberships ADD COLUMN IF NOT EXISTS status text;')
ddl.append('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS manual_account_type text;')
open(tmp, "w").write("\n".join(ddl) + "\n")
psql_file(tmp)
open(tmp, "w").write("SET session_replication_role = replica;\n" + "\n".join(inserts) + "\nSET session_replication_role = origin;\n")
psql_file(tmp)
psql("delete from public.admin_memberships", check=False)
psql(f"insert into public.admin_memberships (id, user_id, status) values (gen_random_uuid(), '{A1}', 'active'), (gen_random_uuid(), '{A2}', 'active')"
     if "admin_memberships" in tables else "select 1", check=False)
psql_file(os.path.join(ROOT, "supabase/migrations/20270425120000_data_reset_full_system.sql"))
psql("insert into public.data_reset_db_guard (allow_destructive, environment_label) values (true, 'local-prod-shape')")

# FK integrity of the seed (replica mode skipped checks): drop rows violating FKs until clean
for _ in range(10):
    bad = 0
    for f in fks:
        sch, par = f["parent"].split(".")
        cond = " AND ".join(f'c."{c}" IS NOT NULL' for c in f["cols"])
        join = " AND ".join(f'p."{pc}" = c."{c}"' for c, pc in zip(f["cols"], f["pcols"]))
        n = psql(f'WITH d AS (DELETE FROM public."{f["t"]}" c WHERE {cond} AND NOT EXISTS (SELECT 1 FROM {sch}."{par}" p WHERE {join}) RETURNING 1) SELECT count(*) FROM d')
        bad += int(n)
    if bad == 0:
        break

total = int(psql("select sum((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::int) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname not like 'data\\_reset\\_%'"))
print(f"tables={len(tables)} fks={len(fks)} seeded_rows={total}")


def snapshot():
    return json.loads(psql("""select coalesce(jsonb_object_agg(c.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::int), '{}')
      from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname not like 'data\\_reset\\_%'"""))


def real_rows():
    return json.loads(psql(f"""select coalesce(jsonb_object_agg(c.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I t where row_to_json(t)::text like %L', c.relname, '%{REAL}%'), false, true, '')))[1]::text::int), '{{}}')
      from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname not like 'data\\_reset\\_%'"""))


before, before_real = snapshot(), real_rows()
manifest = json.load(open(MANIFEST))
mjson = json.dumps(manifest).replace("'", "''")
sr = lambda s: psql(s, role="service_role")
w = sr(f"select public.data_reset_window_request('{A1}', 'prod-shape local test', 'local')")
sr(f"select 1 from public.data_reset_window_decide('{w}', '{A2}', true, 60)")
plan = sr(f"select public.data_reset_full_build_plan(public.data_reset_plan_create('{w}', '{A1}', '{manifest['version']}', '{mjson}'::jsonb))")
summary = json.loads(plan)
plan_id = sr("select id from public.data_reset_plans order by created_at desc limit 1")
h = summary["planHash"]
sr(f"select public.data_reset_plan_confirm('{plan_id}', '{A1}', '{h}', 'local')")
sr(f"select public.data_reset_plan_approve('{plan_id}', '{A2}', '{h}')")
run = sr(f"select public.data_reset_full_start_run('{plan_id}', '{A2}')")
calls = 0
while True:
    calls += 1
    out = json.loads(sr(f"select public.data_reset_full_execute_batch('{run}', 1000)"))
    if out.get("dbDone"):
        break
    if calls > 5000:
        raise SystemExit("db phase did not finish")
while True:
    c = json.loads(sr(f"select public.data_reset_full_storage_claim('{run}', 100)"))
    if c.get("done"):
        break
    raise SystemExit("unexpected storage targets in prod-shape test")
while not json.loads(sr(f"select public.data_reset_full_auth_batch('{run}', 50)")).get("authDone"):
    pass
fin = json.loads(sr(f"select public.data_reset_full_finish_run('{run}', '{A2}', null)"))
after, after_real = snapshot(), real_rows()

fails = []
for t, n in before_real.items():
    if after_real.get(t, 0) != n:
        fails.append(f"real-member rows lost in {t}: {n} -> {after_real.get(t)}")
for t, e in manifest["tables"].items():
    if (e["class"] in ("KEEP", "LEGAL_HOLD", "UNRESOLVED") or e.get("holdAll")) and before.get(t) != after.get(t):
        fails.append(f"protected table changed {t}: {before.get(t)} -> {after.get(t)}")
if not fin["result"]["verify"]["ok"]:
    fails.append("verify issues: " + json.dumps(fin["result"]["verify"]["issues"])[:500])
win = sr(f"select status from public.data_reset_windows where id = '{w}'")
if win != "closed":
    fails.append(f"window not re-locked: {win}")
deleted = sum(before.values()) - sum(after.values())
print(json.dumps({"planned": summary["deleteRows"], "deletedRows": deleted, "deleteTables": summary["deleteTables"],
                  "status": fin["status"], "db": fin["result"]["db"], "auth": fin["result"]["auth"],
                  "accounts": summary["accounts"], "window": win, "batchCalls": calls}, ensure_ascii=False))
print("FAILURES:" if fails else "PROD-SHAPE INVARIANTS: PASS")
for f in fails:
    print("  " + f)
sys.exit(1 if fails else 0)
