/**
 * 배달 방 머리 문구(「매장 · 주문 123」) — 설계 `docs/audit/i18n-postmerge-fix-design-2026-11-27.md` §2 M2.
 *
 * 서버는 `contextMeta.headline` 을 만들지 않는다(서버 언어로 고정 저장되던 결함). 화면이 저장된 매장명·주문번호로
 * 보는 사람 언어 키(`cm_svc_order_headline`·`cm_svc_order_headline_short`)로 그린다.
 * 옛 행: 저장 headline 이 같은 매장명·주문번호로 만든 ko·en 기본 틀과 **정확히** 같을 때만 다시 그린다.
 * 그 외 저장 headline(매장명만 넣은 값 등)은 그대로 둔다.
 */
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

/** 키 → 틀(치환값 없이 부름). 치환은 여기서 한다 — 치환값을 넘기지 않는 번역 함수(전역 검색 등)도 같은 결과 */
type HeadlineTranslate = (key: MessageKey) => string;

function fillTemplate(template: string, vars: Array<[string, string]>): string {
  return vars.reduce((acc, [name, value]) => acc.replaceAll(`{${name}}`, value), template);
}

function buildDeliveryHeadline(storeName: string, orderNo: string, t: HeadlineTranslate): string {
  const store = storeName || t("cm_svc_store_fallback");
  /** 주문번호를 먼저 채운다 — 매장명 안의 「{orderNo}」 글자는 바꾸지 않는다 */
  return orderNo
    ? fillTemplate(t("cm_svc_order_headline"), [
        ["orderNo", orderNo],
        ["store", store],
      ])
    : fillTemplate(t("cm_svc_order_headline_short"), [["store", store]]);
}

/** 배달 방이면 보는 사람 언어 머리 문구, 거래 방이면 저장 headline 그대로. 만들 재료가 없으면 빈 문자열 */
export function resolveRoomContextHeadline(
  meta: CommunityMessengerRoomContextMetaV1 | null | undefined,
  t: HeadlineTranslate = (key) => translateCmUi(key)
): string {
  if (!meta) return "";
  const stored = (meta.headline ?? "").trim();
  if (meta.kind !== "delivery") return stored;
  const storeName = (meta.storeDisplayName ?? "").trim();
  const orderNo = (meta.orderNo ?? "").trim();
  if (!stored) return storeName || orderNo ? buildDeliveryHeadline(storeName, orderNo, t) : "";
  for (const lang of ["ko", "en"] as const) {
    if (stored === buildDeliveryHeadline(storeName, orderNo, (key) => translate(lang, key))) {
      return buildDeliveryHeadline(storeName, orderNo, t);
    }
  }
  return stored;
}
