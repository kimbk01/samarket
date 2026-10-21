#!/usr/bin/env node
/**
 * commerce-open-fixtures.json -> SQL assertions for public.store_front_commerce_open.
 * The same JSON is asserted against TS resolveStoreFrontOpen in
 * lib/stores/__tests__/store-front-commerce-open-sql-twin-parity.test.ts.
 *   usage: node gen-commerce-open-assertions.mjs > /tmp/x.sql
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(fs.readFileSync(path.join(here, "commerce-open-fixtures.json"), "utf8"));

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const out = [];
out.push(`CREATE OR REPLACE FUNCTION pg_temp.co(p_name text, p_hours jsonb, p_open boolean, p_now timestamptz, p_exp boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  v := public.store_front_commerce_open(p_hours, p_open, p_now);
  IF v IS DISTINCT FROM p_exp THEN
    RAISE EXCEPTION 'FAIL: commerce_open fixture % expected % got %', p_name, p_exp, v;
  END IF;
END;
$$;`);
for (const c of cases) {
  const hours = c.hours === null ? "NULL::jsonb" : `${lit(JSON.stringify(c.hours))}::jsonb`;
  const isOpen = c.is_open === null ? "NULL::boolean" : String(c.is_open);
  out.push(`SELECT pg_temp.co(${lit(c.name)}, ${hours}, ${isOpen}, ${lit(c.now)}::timestamptz, ${c.expected});`);
}
out.push(`DO $$ BEGIN RAISE NOTICE 'PASS: store_front_commerce_open matches TS fixture table (${cases.length} cases)'; END $$;`);
process.stdout.write(out.join("\n") + "\n");
