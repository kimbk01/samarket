/**
 * F-13 — QA script production write guard (FAIL-CLOSED).
 *
 * Every script that writes financial tables or calls money RPCs must call
 * `assertQaWriteTarget()` before creating any Supabase / pg client.
 *
 * Resolution: the Supabase project ref is derived from EVERY present source
 *   - NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL host  (<ref>.supabase.co)
 *   - DATABASE_URL / SUPABASE_DB_URL / SUPABASE_POOLER_URL
 *       (db.<ref>.supabase.co host, or pooler username postgres.<ref>)
 *   - SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY JWT `ref` claim
 * All present sources must agree. Allowed ONLY when the agreed target is
 *   - a ref in the hardcoded non-production allowlist, or
 *   - loopback (127.0.0.1 / localhost / ::1) for every source.
 * Unknown / missing / mismatch / production → print reason, process.exit(1).
 *
 * There is intentionally NO environment variable, flag or argument that can widen the
 * allowlist or disable the guard. Changing the lists requires a reviewed code change.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Same list as lib/admin/data-reset/database-target-guard.ts DIBAY_PRODUCTION_SUPABASE_PROJECT_REFS. */
export const QA_GUARD_PRODUCTION_REFS = Object.freeze(["ckdosyydvgzqwpbwuhon"]);

/** Non-production Supabase projects that QA scripts may write to. */
export const QA_GUARD_ALLOWED_NON_PRODUCTION_REFS = Object.freeze(["gczyogboohpixpurckkg"]);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const URL_SOURCES = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"];
const DB_URL_SOURCES = ["DATABASE_URL", "SUPABASE_DB_URL", "SUPABASE_POOLER_URL"];
const JWT_SOURCES = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"];

const REF_RE = /^[a-z0-9]{20}$/;

/** @typedef {{ kind: "ref"; ref: string } | { kind: "loopback" } | { kind: "unknown"; detail: string }} TargetSignal */

function normalizeHost(host) {
  return String(host ?? "").trim().toLowerCase();
}

/** @returns {TargetSignal} */
function signalFromHttpUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return { kind: "unknown", detail: "unparseable URL" };
  }
  const host = normalizeHost(u.hostname);
  if (LOOPBACK_HOSTS.has(host)) return { kind: "loopback" };
  const m = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/);
  if (m && REF_RE.test(m[1])) return { kind: "ref", ref: m[1] };
  return { kind: "unknown", detail: `unrecognized host ${host}` };
}

/** @returns {TargetSignal} */
function signalFromDbUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return { kind: "unknown", detail: "unparseable connection string" };
  }
  const host = normalizeHost(u.hostname);
  if (LOOPBACK_HOSTS.has(host)) return { kind: "loopback" };
  const direct = host.match(/^db\.([a-z0-9]+)\.supabase\.(co|in)$/);
  if (direct && REF_RE.test(direct[1])) return { kind: "ref", ref: direct[1] };
  if (/\.pooler\.supabase\.(com|co)$/.test(host)) {
    const user = decodeURIComponent(u.username || "").toLowerCase();
    const pm = user.match(/^postgres\.([a-z0-9]+)$/);
    if (pm && REF_RE.test(pm[1])) return { kind: "ref", ref: pm[1] };
    return { kind: "unknown", detail: `pooler host without postgres.<ref> username (${host})` };
  }
  return { kind: "unknown", detail: `unrecognized database host ${host}` };
}

function base64UrlDecode(seg) {
  const s = String(seg).replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, "base64").toString("utf8");
}

/** @returns {TargetSignal} */
function signalFromServiceJwt(raw) {
  const parts = String(raw).trim().split(".");
  if (parts.length !== 3) return { kind: "unknown", detail: "service key is not a JWT (ref unverifiable)" };
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return { kind: "unknown", detail: "service key JWT payload undecodable" };
  }
  const ref = typeof payload?.ref === "string" ? payload.ref.trim().toLowerCase() : "";
  if (ref) {
    return REF_RE.test(ref) ? { kind: "ref", ref } : { kind: "unknown", detail: `invalid JWT ref ${ref}` };
  }
  // Local Supabase CLI demo keys carry no ref claim.
  if (payload?.iss === "supabase-demo") return { kind: "loopback" };
  return { kind: "unknown", detail: "service key JWT has no ref claim" };
}

/**
 * Pure resolver (no side effects). `env` is a plain object of environment values.
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true; target: "loopback" | string; sources: string[] } | { ok: false; reason: string; sources: string[] }}
 */
export function resolveQaWriteTarget(env) {
  /** @type {Array<{ source: string; signal: TargetSignal }>} */
  const signals = [];
  const read = (k) => {
    const v = env?.[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  for (const k of URL_SOURCES) {
    const v = read(k);
    if (v) signals.push({ source: k, signal: signalFromHttpUrl(v) });
  }
  for (const k of DB_URL_SOURCES) {
    const v = read(k);
    if (v) signals.push({ source: k, signal: signalFromDbUrl(v) });
  }
  for (const k of JWT_SOURCES) {
    const v = read(k);
    if (v) signals.push({ source: k, signal: signalFromServiceJwt(v) });
  }
  const sources = signals.map((s) => s.source);

  const hasEndpoint = signals.some((s) => URL_SOURCES.includes(s.source) || DB_URL_SOURCES.includes(s.source));
  if (!hasEndpoint) {
    return { ok: false, reason: "missing target: no Supabase URL or database URL in environment", sources };
  }

  const unknown = signals.find((s) => s.signal.kind === "unknown");
  if (unknown) {
    return { ok: false, reason: `unknown target from ${unknown.source}: ${unknown.signal.detail}`, sources };
  }

  const keys = new Set(signals.map((s) => (s.signal.kind === "ref" ? `ref:${s.signal.ref}` : "loopback")));
  if (keys.size !== 1) {
    const detail = signals
      .map((s) => `${s.source}=${s.signal.kind === "ref" ? s.signal.ref : s.signal.kind}`)
      .join(", ");
    return { ok: false, reason: `target mismatch between sources (${detail})`, sources };
  }

  const only = signals[0].signal;
  if (only.kind === "loopback") return { ok: true, target: "loopback", sources };

  const ref = only.kind === "ref" ? only.ref : "";
  if (QA_GUARD_PRODUCTION_REFS.includes(ref)) {
    return { ok: false, reason: `production project ref ${ref} — QA writes are forbidden`, sources };
  }
  if (!QA_GUARD_ALLOWED_NON_PRODUCTION_REFS.includes(ref)) {
    return { ok: false, reason: `project ref ${ref} is not in the non-production allowlist`, sources };
  }
  return { ok: true, target: ref, sources };
}

function readEnvFile(file) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!fs.existsSync(file)) return out;
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).replace(/^export\s+/, "").trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

/**
 * The env the scripts' own loaders will end up with: process.env (shell / `node --env-file`) wins,
 * then `.env.local`, then `.env` (cwd and repo root). Read-only — process.env is NOT mutated, so the
 * guard cannot change script behaviour; it only sees the target before the script loads it.
 * Reading MORE sources can only make the guard stricter (all present sources must agree).
 */
function effectiveScriptEnv() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const dirs = [...new Set([process.cwd(), repoRoot])];
  /** @type {Record<string, string | undefined>} */
  const merged = {};
  for (const dir of dirs) {
    for (const rel of [".env.local", ".env"]) {
      const vals = readEnvFile(path.join(dir, rel));
      for (const [k, v] of Object.entries(vals)) if (!(k in merged)) merged[k] = v;
    }
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string" && v.trim()) merged[k] = v;
  }
  return merged;
}

/**
 * Fail-closed guard. Call at module top, before any client creation.
 * Exits the process with code 1 unless the target is an allowlisted non-production project
 * or loopback.
 */
export function assertQaWriteTarget() {
  const res = resolveQaWriteTarget(effectiveScriptEnv());
  if (!res.ok) {
    console.error(`[db-target-guard] REFUSING QA write: ${res.reason}`);
    console.error(`[db-target-guard] sources checked: ${res.sources.join(", ") || "(none)"}`);
    process.exit(1);
  }
  console.error(`[db-target-guard] QA write target OK: ${res.target} (${res.sources.join(", ")})`);
  return res;
}
