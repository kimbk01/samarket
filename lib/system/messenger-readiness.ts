import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getOptionalRateLimitRedis } from "@/lib/http/rate-limit-redis";

export type WebPushReadiness = {
  /** `WEB_PUSH_ENABLED=1` 이면 true — 이 경우 VAPID·테이블까지 만족해야 전체 ok */
  strict: boolean;
  enabledFlag: boolean;
  vapidConfigured: boolean;
  tableOk: boolean;
  error?: string;
};

export type MessengerReadinessChecks = {
  supabase: { ok: boolean; latencyMs?: number; error?: string };
  rateLimitStore: { ok: boolean; mode: "redis" | "memory"; latencyMs?: number; error?: string };
  webPush: WebPushReadiness;
};

export type MessengerReadinessResult = {
  ok: boolean;
  checks: MessengerReadinessChecks;
  /** ISO 시간 — 로드밸런서 로그 상관 */
  at: string;
};

/**
 * 메신저 의존성 점검 — L7 헬스·배포 게이트용.
 * Supabase 서비스 롤 쿼리 1회 + (설정 시) Redis 왕복 1회 +
 * `WEB_PUSH_ENABLED=1` 이면 VAPID 키·`web_push_subscriptions` 테이블 존재 확인.
 */
function readWebPushEnv(): Pick<WebPushReadiness, "enabledFlag" | "vapidConfigured"> {
  const enabledFlag = process.env.WEB_PUSH_ENABLED === "1";
  const pub = process.env.VAPID_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  return { enabledFlag, vapidConfigured: Boolean(pub && priv) };
}

async function probeWebPushTable(): Promise<Pick<WebPushReadiness, "tableOk" | "error">> {
  try {
    const sb = getSupabaseServer();
    const { error } = await sb.from("web_push_subscriptions").select("id", { head: true, count: "exact" }).limit(0);
    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("does not exist") || error.code === "42P01") {
        return { tableOk: false, error: "table_missing" };
      }
      return { tableOk: false, error: msg.slice(0, 200) };
    }
    return { tableOk: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { tableOk: false, error: msg.slice(0, 200) };
  }
}

export async function runMessengerReadinessProbe(): Promise<MessengerReadinessResult> {
  const at = new Date().toISOString();
  const envPush = readWebPushEnv();
  const checks: MessengerReadinessChecks = {
    supabase: { ok: false },
    rateLimitStore: { ok: true, mode: "memory" },
    webPush: {
      strict: false,
      enabledFlag: envPush.enabledFlag,
      vapidConfigured: envPush.vapidConfigured,
      tableOk: true,
    },
  };
  let ok = true;

  const t0 = Date.now();
  try {
    const sb = getSupabaseServer();
    const r1 = await sb.from("profiles").select("id").limit(1);
    if (!r1.error) {
      checks.supabase = { ok: true, latencyMs: Date.now() - t0 };
    } else {
      const r2 = await sb.from("community_messenger_rooms").select("id").limit(1);
      if (!r2.error) {
        checks.supabase = { ok: true, latencyMs: Date.now() - t0 };
      } else {
        checks.supabase = {
          ok: false,
          latencyMs: Date.now() - t0,
          error: `${r1.error.message} | fallback: ${r2.error.message}`,
        };
        ok = false;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    checks.supabase = { ok: false, latencyMs: Date.now() - t0, error: msg };
    ok = false;
  }

  const redis = getOptionalRateLimitRedis();
  if (redis) {
    const t1 = Date.now();
    try {
      await redis.get("__messenger_readiness_probe__");
      checks.rateLimitStore = {
        ok: true,
        mode: "redis",
        latencyMs: Date.now() - t1,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.rateLimitStore = { ok: false, mode: "redis", error: msg };
      ok = false;
    }
  } else {
    checks.rateLimitStore = { ok: true, mode: "memory" };
  }

  if (envPush.enabledFlag) {
    checks.webPush.strict = true;
    if (!envPush.vapidConfigured) {
      checks.webPush = {
        strict: true,
        enabledFlag: true,
        vapidConfigured: false,
        tableOk: false,
        error: "vapid_keys_missing",
      };
      ok = false;
    } else {
      const tbl = await probeWebPushTable();
      checks.webPush = {
        strict: true,
        enabledFlag: true,
        vapidConfigured: true,
        tableOk: tbl.tableOk,
        error: tbl.tableOk ? undefined : tbl.error,
      };
      if (!tbl.tableOk) ok = false;
    }
  }

  return { ok, checks, at };
}
