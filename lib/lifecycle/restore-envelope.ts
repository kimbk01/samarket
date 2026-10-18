/**
 * Durable restore envelope (Lifecycle SSOT §4.4).
 * Alone never confirms OS_RESTORE — requires nativeRestoreHint === restore.
 */

export const RESTORE_ENVELOPE_KEY = "dibay:lifecycle:restore-v1";
export const RESTORE_ENVELOPE_SCHEMA = 1;
/** 7 days — long enough for OS kill; not a substitute for auth TTL. */
export const RESTORE_ENVELOPE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const RESTORE_ACCOUNT_GUEST = "guest";

export type RestoreEnvelope = {
  schema: number;
  path: string;
  accountKey: string;
  writtenAt: number;
  taskOrSessionToken?: string | null;
};

export function isUsableRestorePath(path: string | null | undefined): path is string {
  if (!path || typeof path !== "string") return false;
  const p = path.trim();
  if (!p.startsWith("/")) return false;
  if (p.startsWith("//")) return false;
  return true;
}

function userIdFromSessionJson(raw: string): string | null {
  try {
    const j = JSON.parse(raw) as {
      user?: { id?: unknown };
      currentSession?: { user?: { id?: unknown } };
    };
    const id = j?.user?.id ?? j?.currentSession?.user?.id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

function decodeBase64UrlUtf8(input: string): string | null {
  try {
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * `@supabase/ssr` browser session cookie: `sb-<ref>-auth-token` (optionally chunked `.0`, `.1`, …),
 * value `base64-<base64url JSON>` or raw JSON. Read-only parse — never writes cookies.
 */
export function readAccountKeyFromSupabaseCookies(cookieHeader: string): string | null {
  const chunks = new Map<string, Array<{ index: number; value: string }>>();
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const m = /^(sb-.+-auth-token)(?:\.(\d+))?$/.exec(name);
    if (!m) continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    const list = chunks.get(m[1]) ?? [];
    list.push({ index: m[2] === undefined ? -1 : Number(m[2]), value });
    chunks.set(m[1], list);
  }
  for (const list of chunks.values()) {
    const whole = list.find((c) => c.index === -1);
    const joined = whole
      ? whole.value
      : list
          .filter((c) => c.index >= 0)
          .sort((a, b) => a.index - b.index)
          .map((c) => c.value)
          .join("");
    const json = joined.startsWith("base64-") ? decodeBase64UrlUtf8(joined.slice("base64-".length)) : joined;
    const id = json ? userIdFromSessionJson(json) : null;
    if (id) return id;
  }
  return null;
}

/**
 * Sync account key of the current Supabase session; guest if none.
 * The browser client stores the session in cookies (`@supabase/ssr`), not localStorage — reading only
 * localStorage made every key `guest`, so the SSOT §4 accountKey check could never invalidate (B2).
 */
export function readLifecycleAccountKey(): string {
  if (typeof window === "undefined") return RESTORE_ACCOUNT_GUEST;
  try {
    const fromCookie = readAccountKeyFromSupabaseCookies(document.cookie ?? "");
    if (fromCookie) return fromCookie;
  } catch {
    /* fall through to legacy localStorage session */
  }
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.includes("-auth-token")) continue;
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const j = JSON.parse(raw) as {
        user?: { id?: unknown };
        currentSession?: { user?: { id?: unknown } };
      };
      const id = j?.user?.id ?? j?.currentSession?.user?.id;
      if (typeof id === "string" && id.trim()) return id.trim();
    }
  } catch {
    /* ignore */
  }
  return RESTORE_ACCOUNT_GUEST;
}

export function readRestoreEnvelope(): RestoreEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RESTORE_ENVELOPE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<RestoreEnvelope>;
    if (v?.schema !== RESTORE_ENVELOPE_SCHEMA) return null;
    if (typeof v.path !== "string" || typeof v.accountKey !== "string" || typeof v.writtenAt !== "number") {
      return null;
    }
    return {
      schema: RESTORE_ENVELOPE_SCHEMA,
      path: v.path,
      accountKey: v.accountKey,
      writtenAt: v.writtenAt,
      taskOrSessionToken: typeof v.taskOrSessionToken === "string" ? v.taskOrSessionToken : null,
    };
  } catch {
    return null;
  }
}

export type RestoreEnvelopeValidation =
  | { ok: true; envelope: RestoreEnvelope }
  | { ok: false; reason: string };

export function validateRestoreEnvelope(
  envelope: RestoreEnvelope | null,
  nowMs: number = Date.now(),
  accountKey: string = readLifecycleAccountKey()
): RestoreEnvelopeValidation {
  if (!envelope) return { ok: false, reason: "missing" };
  if (envelope.schema !== RESTORE_ENVELOPE_SCHEMA) return { ok: false, reason: "schema" };
  if (!isUsableRestorePath(envelope.path)) return { ok: false, reason: "path" };
  if (!Number.isFinite(envelope.writtenAt) || nowMs - envelope.writtenAt > RESTORE_ENVELOPE_MAX_AGE_MS) {
    return { ok: false, reason: "expired" };
  }
  if (envelope.writtenAt > nowMs + 60_000) return { ok: false, reason: "clock" };
  if (envelope.accountKey !== accountKey) return { ok: false, reason: "account_mismatch" };
  return { ok: true, envelope };
}

export function writeRestoreEnvelope(path: string, accountKey: string = readLifecycleAccountKey()): boolean {
  if (typeof window === "undefined") return false;
  if (!isUsableRestorePath(path)) return false;
  const pathOnly = path.trim().split(/[?#]/)[0] || path.trim();
  const row: RestoreEnvelope = {
    schema: RESTORE_ENVELOPE_SCHEMA,
    path: pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`,
    accountKey: accountKey || RESTORE_ACCOUNT_GUEST,
    writtenAt: Date.now(),
  };
  try {
    window.localStorage.setItem(RESTORE_ENVELOPE_KEY, JSON.stringify(row));
    return true;
  } catch {
    return false;
  }
}

export function discardRestoreEnvelope(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RESTORE_ENVELOPE_KEY);
  } catch {
    /* ignore */
  }
}
