/**
 * 회원 피드 배너 목적지 검사 (광고 감사 FB-05 · 2026-11-26) — 신청 POST 에서 보류(포인트) 전에 부른다.
 *
 * 예전에는 글 id 가 비었는지만 봤다(`feed-ad-destination.ts`) → 남의 글·없는 글·숨긴 글로 신청해 포인트가 묶이고,
 * 승인 뒤 노출 필터(`feed-ad-exposure-filter.ts`)가 그 배너를 빼서 「돈 내고 노출 0」이 될 수 있었다.
 *
 * - 거래 글·커뮤니티 글 목적지 = 신청 회원이 쓴 공개 글만.
 * - 공개 여부는 노출 필터와 같은 조회(`loadPopupEntityDestinationLookups`)로 판정 — 기준 1곳.
 * - 작성자 = 신청 회원. 조회 실패면 신청하지 않는다(fail-closed).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadPopupEntityDestinationLookups,
  popupEntityCtaKey,
} from "@/lib/platform-popup/popup-event-destination-availability";

export type FeedAdMemberDestinationError =
  | "destination_not_mine"
  | "destination_unavailable"
  | "destination_check_failed";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MEMBER_ENTITY_TABLE = {
  trade_listing: "posts",
  community_post: "community_posts",
} as const;

export async function checkMemberFeedAdDestination(
  sb: SupabaseClient,
  userId: string,
  dest: { destinationType: string; destinationId: string }
): Promise<{ ok: true } | { ok: false; error: FeedAdMemberDestinationError }> {
  const type = dest.destinationType.trim();
  /** 글 목적지만 작성자·공개를 본다. 다른 종류(외부·앱 안 화면·매장·이벤트)는 `normalizeFeedAdDestination` 검사 그대로(계약: 정해진 종류만) */
  if (type !== "trade_listing" && type !== "community_post") return { ok: true };
  const id = dest.destinationId.trim();
  /** uuid 가 아니면 DB 에 묻지 않는다(잘못된 id 로 Postgres 오류를 만들지 않음) */
  if (!UUID_RE.test(id)) return { ok: false, error: "destination_unavailable" };
  const key = popupEntityCtaKey(type, id);
  const [lookups, owner] = await Promise.all([
    loadPopupEntityDestinationLookups(sb, [key]),
    sb.from(MEMBER_ENTITY_TABLE[type]).select("user_id").eq("id", id).maybeSingle(),
  ]);
  if (owner.error) return { ok: false, error: "destination_check_failed" };
  const ownerId = String((owner.data as { user_id?: unknown } | null)?.user_id ?? "");
  if (!ownerId || ownerId !== userId) return { ok: false, error: "destination_not_mine" };
  const l = lookups.get(key);
  if (!l || !l.exists || !l.visible) return { ok: false, error: "destination_unavailable" };
  return { ok: true };
}
