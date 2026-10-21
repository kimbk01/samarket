#!/usr/bin/env node
/**
 * Fixture JSON files -> SQL assertions for public.store_front_commerce_open (modeled on stage3-rpc's generator).
 *   usage: node gen-commerce-open-assertions.mjs <fixtures.json> [more.json ...] > /tmp/x.sql
 */
import fs from "node:fs";

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
let n = 0;
for (const file of process.argv.slice(2)) {
  const { cases } = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const c of cases) {
    const hours = c.hours === null ? "NULL::jsonb" : `${lit(JSON.stringify(c.hours))}::jsonb`;
    const isOpen = c.is_open === null ? "NULL::boolean" : String(c.is_open);
    out.push(`SELECT pg_temp.co(${lit(c.name)}, ${hours}, ${isOpen}, ${lit(c.now)}::timestamptz, ${c.expected});`);
    n += 1;
  }
}
out.push(`DO $$ BEGIN RAISE NOTICE 'PASS: store_front_commerce_open matches TS fixture table (${n} cases)'; END $$;`);
process.stdout.write(out.join("\n") + "\n");
