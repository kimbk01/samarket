/**
 * 입점 심사 상태 변경 기록 (`store_application_events`) — 쓰기·읽기는 이 파일만.
 * 상태를 바꾼 같은 요청 안에서 바로 기록한다. 기록 실패는 상태 변경을 되돌리지 않고 로그만 남긴다
 * (상태 자체는 stores.approval_status 가 원천 — 이 표는 시각·이력 표시용).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreApplicationEventRow } from "@/lib/stores/store-application-step";

type AnySb = SupabaseClient;

export async function appendStoreApplicationEvent(
  sb: AnySb,
  input: {
    storeId: string;
    fromStatus: string | null;
    toStatus: string;
    action: string;
    reason?: string | null;
    actorType: "owner" | "admin" | "system";
    actorId?: string | null;
  }
): Promise<void> {
  try {
    const { error } = await sb.from("store_application_events").insert({
      store_id: input.storeId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      action: input.action,
      reason: (input.reason ?? "").trim() || null,
      actor_type: input.actorType,
      actor_id: input.actorId ?? null,
    });
    if (error) console.error("[store_application_events] insert", input.storeId, input.action, error.message);
  } catch (err) {
    console.error("[store_application_events] insert", input.storeId, input.action, err);
  }
}

export async function listStoreApplicationEvents(
  sb: AnySb,
  storeId: string
): Promise<{ ok: true; rows: StoreApplicationEventRow[] } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("store_application_events")
    .select("id, from_status, to_status, action, reason, actor_type, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    if (/store_application_events/.test(error.message) && /does not exist|schema cache/i.test(error.message)) {
      return { ok: true, rows: [] };
    }
    return { ok: false, error: "application_events_read_failed" };
  }
  return { ok: true, rows: (data ?? []) as StoreApplicationEventRow[] };
}
