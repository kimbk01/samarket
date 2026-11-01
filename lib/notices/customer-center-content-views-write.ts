/**
 * 고객센터 글 열람 기록 쓰기 — 알림 쪽 읽음과 글 쪽 읽음을 같게 (알림 최종 설계 §3 · 재감사 2026-11-02 M2) — 서버 전용.
 *
 * 알림을 읽으면(종 줄·밀어서 읽음·분야 「모두 읽음」·푸시 탭) 그 알림이 가리키는 고객센터 글도 읽음.
 * 글 쪽(`customer-center-read-state`)은 이미 「글을 읽으면 알림도 읽음」을 한다 → 이 파일이 반대 방향.
 * 열람 기록만 남기고 조회수는 올리지 않는다(「모두 읽음」과 같은 규칙 — 실제로 본 것이 아님).
 * 알림 읽음 함수가 이 파일을 부르므로 이 파일은 알림 읽음 함수를 부르지 않는다(순환 없음).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** 열람 기록 표의 날짜 단위(RPC `record_customer_center_content_view` 와 같은 서울 날짜). */
export function customerCenterViewDay(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/** 알림이 글을 가리키는 키 (운영 DB 실측: `display_payload.content_id` / `appNoticeId`). */
export function customerCenterContentIdFromNotificationPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  for (const k of ["content_id", "appNoticeId"] as const) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export async function recordCustomerCenterContentViews(
  sb: SupabaseClient,
  userId: string,
  contentIds: readonly string[]
): Promise<number> {
  const uid = userId.trim();
  const ids = [...new Set(contentIds.map((x) => x.trim()).filter(Boolean))];
  if (!uid || ids.length === 0) return 0;
  // 지금 있는 글만(삭제된 글·다른 표의 id 는 기록하지 않는다).
  const { data: existing, error: exErr } = await sb.from("app_notices").select("id").in("id", ids);
  if (exErr) throw new Error(`customer_center_content_lookup_failed: ${exErr.message}`);
  const live = ((existing ?? []) as { id: string }[]).map((r) => String(r.id));
  if (live.length === 0) return 0;
  const day = customerCenterViewDay();
  const { error } = await sb
    .from("customer_center_content_views")
    .upsert(
      live.map((content_id) => ({ content_id, user_id: uid, view_day: day })),
      { onConflict: "content_id,user_id,view_day", ignoreDuplicates: true }
    );
  if (error) throw new Error(`customer_center_view_write_failed: ${error.message}`);
  return live.length;
}

/** 읽음 처리한 알림 id → 그 알림들이 가리키는 글의 열람 기록. 실패해도 알림 읽음 결과는 바꾸지 않는다(호출자가 catch). */
export async function recordCustomerCenterContentViewsForNotificationIds(
  sb: SupabaseClient,
  userId: string,
  notificationEventIds: readonly string[]
): Promise<number> {
  const ids = [...new Set(notificationEventIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return 0;
  const contentIds: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb
      .from("notification_events")
      .select("id, display_payload")
      .eq("user_id", userId)
      .in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`notification_events_content_lookup_failed: ${error.message}`);
    for (const r of (data ?? []) as { display_payload?: unknown }[]) {
      const cid = customerCenterContentIdFromNotificationPayload(r.display_payload);
      if (cid) contentIds.push(cid);
    }
  }
  return recordCustomerCenterContentViews(sb, userId, contentIds);
}
