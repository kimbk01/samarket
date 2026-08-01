import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCAN_ROOTS = ["app", "lib", "scripts"];
const FILE_RE = /\.(ts|tsx|mjs|js)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (FILE_RE.test(name)) out.push(p);
  }
  return out;
}

/**
 * Phase A: physical DELETE on user_devices is forbidden in app/lib/scripts.
 * Cap/wipe must use inactive or RPC. Campaign FK makes DELETE unsafe until Phase B.
 */
describe("user_devices no physical DELETE contract", () => {
  it("forbids .from('user_devices').delete( in application TypeScript", () => {
    const hits: string[] = [];
    const deleteRe = /\.from\(\s*['"]user_devices['"]\s*\)\s*\.delete\s*\(/g;
    for (const root of SCAN_ROOTS) {
      const abs = join(ROOT, root);
      try {
        statSync(abs);
      } catch {
        continue;
      }
      for (const file of walk(abs)) {
        // Allow this contract file / comments mentioning the pattern.
        if (file.includes("user-devices-no-delete-contract")) continue;
        const text = readFileSync(file, "utf8");
        if (deleteRe.test(text)) {
          hits.push(file.replace(ROOT + "/", ""));
        }
        deleteRe.lastIndex = 0;
      }
    }
    expect(hits, `unexpected user_devices.delete paths: ${hits.join(", ")}`).toEqual([]);
  });

  it("register RPC migration never DELETE FROM user_devices", () => {
    const sql = readFileSync(
      join(ROOT, "supabase/migrations/20261015140000_register_user_device_rpc.sql"),
      "utf8",
    );
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+public\.user_devices\b/i);
    expect(sql).toContain("DROP POLICY IF EXISTS user_devices_delete_own");
  });
});
