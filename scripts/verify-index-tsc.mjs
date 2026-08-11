#!/usr/bin/env node
/**
 * Typecheck the git index (what the next commit will contain), not the dirty working tree.
 *
 * Default project is tsconfig.build.json (production source). `--test` uses tsconfig.test.json.
 * Local working-tree tsc is not this gate. GitHub Actions and Vercel clone the commit only.
 *
 * Usage:
 *   node scripts/verify-index-tsc.mjs           # source graph, git write-tree
 *   node scripts/verify-index-tsc.mjs --test    # test graph
 *   node scripts/verify-index-tsc.mjs --head    # HEAD only
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const headOnly = process.argv.includes("--head");
const testGraph = process.argv.includes("--test");
const tsconfigName = testGraph ? "tsconfig.test.json" : "tsconfig.build.json";

function git(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 16e6 });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || r.stdout || "").trim()}`);
  }
  return r.stdout.trim();
}

function pipe(cmd1, args1, cmd2, args2, cwd1) {
  return new Promise((resolve, reject) => {
    const a = spawn(cmd1, args1, { cwd: cwd1, stdio: ["ignore", "pipe", "inherit"] });
    const b = spawn(cmd2, args2, { stdio: ["pipe", "inherit", "inherit"] });
    a.on("error", reject);
    b.on("error", reject);
    a.stdout.pipe(b.stdin);
    let aCode = 0;
    a.on("close", (code) => {
      aCode = code ?? 1;
    });
    b.on("close", (code) => {
      if (aCode !== 0) {
        reject(new Error(`${cmd1} exited ${aCode}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function runTsc(cwd) {
  const bin = path.join(ROOT, "node_modules/.bin/tsc");
  if (!existsSync(bin)) {
    throw new Error(`tsc not found: ${bin}`);
  }
  const r = spawnSync(bin, ["--noEmit", "--pretty", "false", "-p", tsconfigName], {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  return r.status ?? 1;
}

const tree = headOnly ? git(["rev-parse", "HEAD^{tree}"]) : git(["write-tree"]);
const dir = mkdtempSync(path.join(tmpdir(), "samarket-index-tsc-"));
console.log(
  `[verify-index-tsc] tree=${tree} dir=${dir} mode=${headOnly ? "HEAD" : "index"} project=${tsconfigName}`,
);

try {
  await pipe("git", ["archive", tree], "tar", ["-x", "-C", dir], ROOT);
  const nm = path.join(dir, "node_modules");
  if (!existsSync(nm)) {
    symlinkSync(path.join(ROOT, "node_modules"), nm);
  }
  const status = runTsc(dir);
  if (status !== 0) {
    console.error(
      "[verify-index-tsc] FAIL: tsc of git tree (not working tree). Stage every file the commit needs.",
    );
    process.exit(status);
  }
  console.log("[verify-index-tsc] PASS");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
