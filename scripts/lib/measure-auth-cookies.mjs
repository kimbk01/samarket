import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Playwright storage state 또는 SAMARKET_MEASURE_COOKIE — 로그인 flow 재측정용 */
export function loadMeasureCookieHeader() {
  const inline = process.env.SAMARKET_MEASURE_COOKIE?.trim();
  if (inline) return { cookie: inline, source: "SAMARKET_MEASURE_COOKIE" };

  const statePath = (
    process.env.PLAYWRIGHT_STORAGE_STATE?.trim() ||
    path.join(root, "tests", "e2e", ".auth", "cm-storage.json")
  );
  if (!fs.existsSync(statePath)) {
    return { cookie: null, source: null, storage_state: statePath };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const cookies = Array.isArray(raw.cookies) ? raw.cookies : [];
    if (!cookies.length) return { cookie: null, source: "empty_storage_state", storage_state: statePath };
    const origin = (process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
    const host = new URL(origin).hostname;
    const parts = cookies
      .filter((c) => {
        const d = (c.domain || "").replace(/^\./, "");
        return !d || host.endsWith(d) || host === d;
      })
      .map((c) => `${c.name}=${c.value}`);
    return {
      cookie: parts.length ? parts.join("; ") : null,
      source: parts.length ? "PLAYWRIGHT_STORAGE_STATE" : "no_matching_cookies",
      storage_state: statePath,
    };
  } catch (e) {
    return {
      cookie: null,
      source: "storage_state_parse_error",
      storage_state: statePath,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function measureFetchInitWithAuth(extra = {}) {
  const { cookie } = loadMeasureCookieHeader();
  const headers = { ...(extra.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  return {
    ...extra,
    headers,
    credentials: cookie ? "include" : extra.credentials ?? "omit",
  };
}
