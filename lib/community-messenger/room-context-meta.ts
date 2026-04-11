import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

/**
 * `community_messenger_rooms.summary` 에 JSON 으로 넣는 거래/배달 컨텍스트(v1).
 * 백엔드가 채우지 않으면 null — 목록은 기존 휴리스틱(제목/요약 키워드)만 사용.
 *
 * 예:
 * `{"v":1,"kind":"trade","headline":"상품명","priceLabel":"29,000원","thumbnailUrl":"https://…","stepLabel":"배송 중"}`
 */
export function parseCommunityMessengerRoomContextMeta(raw: string | null | undefined): CommunityMessengerRoomContextMetaV1 | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s[0] !== "{") return null;
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.v !== 1) return null;
    if (o.kind !== "trade" && o.kind !== "delivery") return null;
    const out: CommunityMessengerRoomContextMetaV1 = { v: 1, kind: o.kind };
    if (typeof o.headline === "string" && o.headline.trim()) out.headline = o.headline.trim();
    if (typeof o.priceLabel === "string" && o.priceLabel.trim()) out.priceLabel = o.priceLabel.trim();
    if (o.thumbnailUrl === null) {
      out.thumbnailUrl = null;
    } else if (typeof o.thumbnailUrl === "string" && o.thumbnailUrl.trim()) {
      out.thumbnailUrl = o.thumbnailUrl.trim();
    }
    if (typeof o.stepLabel === "string" && o.stepLabel.trim()) out.stepLabel = o.stepLabel.trim();
    if (typeof o.productChatId === "string" && o.productChatId.trim()) out.productChatId = o.productChatId.trim();
    return out;
  } catch {
    return null;
  }
}

/** DB `summary` 컬럼에 저장할 문자열 — 파서와 쌍을 이룸 */
export function serializeCommunityMessengerRoomContextMeta(meta: CommunityMessengerRoomContextMetaV1): string {
  return JSON.stringify(meta);
}
