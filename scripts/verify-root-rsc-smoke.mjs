#!/usr/bin/env node
/**
 * Root RSC smoke — requires `npx next start -p <port> -H 127.0.0.1` already running.
 * Usage: ROOT_RSC_SMOKE_PORT=3099 npm run verify:root-rsc-smoke
 */
const port = Number(process.env.ROOT_RSC_SMOKE_PORT ?? "3099");
const host = process.env.ROOT_RSC_SMOKE_HOST ?? "127.0.0.1";
const base = `http://${host}:${port}`;

const paths = ["/market", "/philife", "/stores"];

function fail(msg) {
  console.error(`verify:root-rsc-smoke FAIL — ${msg}`);
  process.exit(1);
}

async function headStatus(pathname) {
  const res = await fetch(`${base}${pathname}`, { method: "HEAD", redirect: "manual" });
  return res.status;
}

async function main() {
  for (const pathname of paths) {
    let status;
    try {
      status = await headStatus(pathname);
    } catch (err) {
      fail(`${pathname} — server not reachable at ${base} (${err instanceof Error ? err.message : err})`);
    }
    if (status !== 200) {
      fail(`${pathname} returned HTTP ${status} (expected 200)`);
    }
    console.log(`verify:root-rsc-smoke OK ${pathname} → ${status}`);
  }
  console.log("verify:root-rsc-smoke PASS");
}

void main();
