/**
 * 상위노출 만료 알림 (광고 DB 묶음 A-DB · TB-09 · 2026-11-27).
 *
 * 만료 함수 2개(`expire_trade_promotion_orders`·`community_promotion_orders_expire`)는 상태만 바꾸고 알림이 없었다.
 * 이미 10분마다 도는 만료 작업 2개에 붙여, **하루 1회(09:00 PHT 창)** 만 아래 두 알림을 보낸다:
 *  ① 24시간 안에 끝나는 진행 중 주문 — 「상위노출이 내일 끝나요 · 내 광고에서 연장」
 *  ② 지난 24시간 안에 만료된 주문 — 「상위노출이 끝났어요」
 * 중복 방지 = 알림 `dedupe_key`(주문당 1번) → DB 열 추가 없음. 문구 = 회원 언어(`loadNotificationUserLanguage`).
 * 운영 Supabase 요청: 창 밖 실행 = 0회 · 창 안 = 조회 1회 + 주문마다 언어 조회·알림 저장.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { translateBy } from "@/lib/i18n/translate-by";
import { formatPhtDisplayDateTime } from "@/lib/time/format-pht-display";

export type PromotionNoticeDomain = "trade" | "community";

const DAY_MS = 86_400_000;
/** 하루 1회 창: 01:00~01:09 UTC = 09:00~09:09 PHT (만료 작업이 10분마다 돌므로 창 안에 1번 들어온다) */
export function isDailyPromotionNoticeWindow(nowMs: number): boolean {
  const d = new Date(nowMs);
  return d.getUTCHours() === 1 && d.getUTCMinutes() < 10;
}

type OrderRow = {
  id?: unknown;
  user_id?: unknown;
  target_title?: unknown;
  end_at?: unknown;
};

const BATCH_LIMIT = 300;

export async function runPromotionExpiryNoticeBatch(
  sb: SupabaseClient,
  domain: PromotionNoticeDomain,
  nowMs: number = Date.now()
): Promise<{ ok: true; soon: number; ended: number } | { ok: false; error: string }> {
  const nowIso = new Date(nowMs).toISOString();
  const soonIso = new Date(nowMs + DAY_MS).toISOString();
  const pastIso = new Date(nowMs - DAY_MS).toISOString();
  const [soonRes, endedRes] = await Promise.all([
    sb
      .from("point_promotion_orders")
      .select("id, user_id, target_title, end_at")
      .eq("domain", domain)
      .eq("order_status", "active")
      .gt("end_at", nowIso)
      .lte("end_at", soonIso)
      .limit(BATCH_LIMIT),
    sb
      .from("point_promotion_orders")
      .select("id, user_id, target_title, end_at")
      .eq("domain", domain)
      .eq("order_status", "expired")
      .gte("ended_at", pastIso)
      .limit(BATCH_LIMIT),
  ]);
  if (soonRes.error) return { ok: false, error: soonRes.error.message };
  if (endedRes.error) return { ok: false, error: endedRes.error.message };

  const pushKind = domain === "community" ? "community" : "trade";
  let soon = 0;
  let ended = 0;
  for (const kind of ["soon", "ended"] as const) {
    const rows = ((kind === "soon" ? soonRes.data : endedRes.data) ?? []) as OrderRow[];
    for (const r of rows) {
      const orderId = String(r.id ?? "");
      const userId = String(r.user_id ?? "");
      if (!orderId || !userId) continue;
      const lang = await loadNotificationUserLanguage(sb, userId);
      const title = String(r.target_title ?? "").trim() || translateBy(lang, "promo_target_untitled");
      const endAt = typeof r.end_at === "string" ? r.end_at : null;
      const saved = await appendUserNotification(sb, {
        user_id: userId,
        notification_type: "status",
        title: translateBy(lang, kind === "soon" ? "promo_notice_soon_title" : "promo_notice_ended_title"),
        body:
          kind === "soon"
            ? translateBy(lang, "promo_notice_soon_body", {
                title,
                date: endAt ? formatPhtDisplayDateTime(endAt, lang) : "—",
              })
            : translateBy(lang, "promo_notice_ended_body", { title }),
        link_url: "/mypage/ads",
        push_kind: pushKind,
        ref_id: orderId,
        dedupe_key: `promotion-${kind}:${orderId}`,
        meta: { kind: kind === "soon" ? "promotion_expiry_soon" : "promotion_ended", order_id: orderId, domain },
      });
      if (saved) {
        if (kind === "soon") soon += 1;
        else ended += 1;
      }
    }
  }
  return { ok: true, soon, ended };
}
