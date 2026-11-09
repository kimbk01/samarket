import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  DEFAULT_DELIVERY_LAUNCH_SETTINGS,
  deliveryLaunchSettingsFromRow,
  type DeliveryLaunchContent,
  type DeliveryLaunchMode,
  type DeliveryLaunchSettings,
} from "@/lib/delivery/launch/delivery-launch-contract";

/** 배달 오픈 관리 — 서버 읽기·저장 (Owner 2026-11-10). 계약: `delivery-launch-contract.ts` */

export const DELIVERY_LAUNCH_SERVER_CACHE_TAG = "delivery-launch";

const SELECT = "mode, free_until, fab_enabled, content, revision, updated_by, updated_at";

function isMissingTableError(message: string | undefined): boolean {
  const m = String(message ?? "");
  return /delivery_launch_settings/.test(m) && /(does not exist|schema cache|not find)/i.test(m);
}

/**
 * 원본 읽기 (캐시 없음 — 어드민·주문 거부 판정용).
 * 테이블이 아직 없으면(운영 미적용) 정식 운영 기본값 = 지금 화면 그대로.
 * 그 밖의 읽기 오류는 `error` 로 돌려준다 (호출부가 열지 막을지 정함).
 */
export async function readDeliveryLaunchSettings(
  sb: SupabaseClient
): Promise<{ ok: true; settings: DeliveryLaunchSettings; tableMissing: boolean } | { ok: false; error: string }> {
  const { data, error } = await sb.from("delivery_launch_settings").select(SELECT).eq("id", 1).maybeSingle();
  if (error) {
    if (isMissingTableError(error.message)) {
      return { ok: true, settings: DEFAULT_DELIVERY_LAUNCH_SETTINGS, tableMissing: true };
    }
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    settings: deliveryLaunchSettingsFromRow((data as Record<string, unknown> | null) ?? null),
    tableMissing: false,
  };
}

async function loadForCache(): Promise<DeliveryLaunchSettings> {
  const sb = tryGetSupabaseForStores();
  if (!sb) return DEFAULT_DELIVERY_LAUNCH_SETTINGS;
  try {
    const r = await readDeliveryLaunchSettings(sb);
    if (r.ok) return r.settings;
    console.warn("[delivery-launch] read failed — open 기본값", r.error);
    return DEFAULT_DELIVERY_LAUNCH_SETTINGS;
  } catch {
    return DEFAULT_DELIVERY_LAUNCH_SETTINGS;
  }
}

const loadCached = unstable_cache(loadForCache, ["delivery-launch:server:v1"], {
  revalidate: 60,
  tags: [DELIVERY_LAUNCH_SERVER_CACHE_TAG],
});

/**
 * 공개 화면·주문 거부 판정용 (60초 캐시 · 어드민 저장 시 태그 무효화).
 * Next 캐시 계층이 없는 실행 환경(단위 테스트·스크립트)에서는 원본 1회 읽기로 대신한다.
 */
export async function loadDeliveryLaunchSettingsCached(): Promise<DeliveryLaunchSettings> {
  try {
    return await loadCached();
  } catch {
    return loadForCache();
  }
}

export type SaveDeliveryLaunchInput = {
  expectedRevision: number;
  mode: DeliveryLaunchMode;
  freeUntil: string | null;
  fabEnabled: boolean;
  content: DeliveryLaunchContent;
  actorId: string;
};

export type SaveDeliveryLaunchResult =
  | { ok: true; revision: number }
  | { ok: false; error: "stale_revision"; currentRevision: number }
  | { ok: false; error: string };

export async function saveDeliveryLaunchSettingsCas(
  sb: SupabaseClient,
  input: SaveDeliveryLaunchInput
): Promise<SaveDeliveryLaunchResult> {
  const { data, error } = await sb.rpc("save_delivery_launch_settings_cas", {
    p_expected_revision: input.expectedRevision,
    p_mode: input.mode,
    p_free_until: input.freeUntil,
    // 모집 팝업은 되돌림(Owner 2026-11-10) — DB 열은 남아 있어 항상 true 로만 쓴다(읽지 않음)
    p_popup_enabled: true,
    p_fab_enabled: input.fabEnabled,
    p_content: input.content,
    p_actor_id: input.actorId,
  });
  if (error) {
    if (/save_delivery_launch_settings_cas/.test(error.message ?? "") && /(does not exist|schema cache|not find)/i.test(error.message ?? "")) {
      return { ok: false, error: "migration_not_applied" };
    }
    return { ok: false, error: "db_error" };
  }
  const out = (data ?? {}) as { ok?: boolean; error?: string; revision?: number; current_revision?: number };
  if (out.ok === true && typeof out.revision === "number") return { ok: true, revision: out.revision };
  if (out.error === "stale_revision") {
    return { ok: false, error: "stale_revision", currentRevision: Number(out.current_revision ?? -1) };
  }
  return { ok: false, error: out.error || "save_failed" };
}

export type DeliveryLaunchLogRow = {
  revision: number;
  actorId: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: string;
};

export async function listDeliveryLaunchLogs(sb: SupabaseClient, limit = 20): Promise<DeliveryLaunchLogRow[]> {
  const { data, error } = await sb
    .from("delivery_launch_settings_logs")
    .select("revision, actor_id, before_json, after_json, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error || !Array.isArray(data)) return [];
  return data.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      revision: Number(row.revision) || 0,
      actorId: typeof row.actor_id === "string" ? row.actor_id : null,
      before: (row.before_json as Record<string, unknown>) ?? {},
      after: (row.after_json as Record<string, unknown>) ?? {},
      createdAt: String(row.created_at ?? ""),
    };
  });
}

/* ───────────── 매장 확인 허용 계정 (설계 v3.2 §3-4-3) ───────────── */

export type DeliveryLaunchReviewer = {
  userId: string;
  note: string;
  addedAt: string;
  username: string | null;
  nickname: string | null;
};

function isMissingReviewersTable(message: string | undefined): boolean {
  const m = String(message ?? "");
  return /delivery_launch_reviewers/.test(m) && /(does not exist|schema cache|not find)/i.test(m);
}

export async function listDeliveryLaunchReviewers(sb: SupabaseClient): Promise<DeliveryLaunchReviewer[]> {
  const { data, error } = await sb
    .from("delivery_launch_reviewers")
    .select("user_id, note, added_at")
    .order("added_at", { ascending: true })
    .limit(200);
  if (error || !Array.isArray(data) || data.length === 0) return [];
  const ids = data.map((r) => String((r as { user_id: string }).user_id));
  const { data: profs } = await sb.from("profiles").select("id, username, nickname").in("id", ids);
  const byId = new Map(
    (profs ?? []).map((p) => {
      const row = p as { id: string; username?: string | null; nickname?: string | null };
      return [row.id, row] as const;
    })
  );
  return data.map((r) => {
    const row = r as { user_id: string; note: string | null; added_at: string };
    const p = byId.get(row.user_id);
    return {
      userId: row.user_id,
      note: row.note ?? "",
      addedAt: row.added_at,
      username: p?.username ?? null,
      nickname: p?.nickname ?? null,
    };
  });
}

/** 「@아이디」·아이디·닉네임(정확히 일치) 로 회원 1명 찾기 — 여러 명이면 `ambiguous` */
export async function findDeliveryLaunchReviewerCandidate(
  sb: SupabaseClient,
  query: string
): Promise<{ ok: true; userId: string } | { ok: false; error: "not_found" | "ambiguous" | "invalid_query" }> {
  const q = query.trim().replace(/^@/, "");
  if (!q || q.length > 60) return { ok: false, error: "invalid_query" };
  const byUsername = await sb.from("profiles").select("id").ilike("username", q).limit(2);
  const rows = byUsername.data ?? [];
  if (rows.length === 1) return { ok: true, userId: String((rows[0] as { id: string }).id) };
  if (rows.length > 1) return { ok: false, error: "ambiguous" };
  const byNick = await sb.from("profiles").select("id").eq("nickname", q).limit(2);
  const nick = byNick.data ?? [];
  if (nick.length === 1) return { ok: true, userId: String((nick[0] as { id: string }).id) };
  if (nick.length > 1) return { ok: false, error: "ambiguous" };
  return { ok: false, error: "not_found" };
}

/**
 * 보는 사람이 매장 모집 중에도 정식 운영 화면을 보는가 — 어드민에서 지정한 계정만 (관리자 자동 포함 없음 — 관리자는 모집 화면을 고객과 같이 보고, 매장은 「고객 화면으로 보기」·매장 직접 주소로 확인 · Owner 2026-11-10).
 * 표가 아직 없으면(운영 미적용) 관리자만.
 */
export async function isDeliveryLaunchViewerBypass(sb: SupabaseClient, userId: string | null): Promise<boolean> {
  const uid = userId?.trim() || "";
  if (!uid) return false;
  const { data, error } = await sb.from("delivery_launch_reviewers").select("user_id").eq("user_id", uid).maybeSingle();
  if (!error && data) return true;
  if (error && !isMissingReviewersTable(error.message)) {
    console.warn("[delivery-launch] reviewer lookup failed", error.message);
  }
  return false;
}
