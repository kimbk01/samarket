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

const SELECT = "mode, free_until, popup_enabled, fab_enabled, content, revision, updated_by, updated_at";

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

/** 공개 화면용 (60초 캐시 · 어드민 저장 시 태그 무효화) */
export async function loadDeliveryLaunchSettingsCached(): Promise<DeliveryLaunchSettings> {
  return loadCached();
}

export type SaveDeliveryLaunchInput = {
  expectedRevision: number;
  mode: DeliveryLaunchMode;
  freeUntil: string | null;
  popupEnabled: boolean;
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
    p_popup_enabled: input.popupEnabled,
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
