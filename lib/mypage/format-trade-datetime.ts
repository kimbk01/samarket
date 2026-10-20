import { formatMypageDate } from "@/lib/mypage/format-mypage-date";

/**
 * 구매/판매 내역 카드용 거래 시각 표시 — 내정보 날짜 SSOT(`formatMypageDate` datetime: 회원 언어·PHT)에 위임.
 * 값이 없거나 잘못된 날짜면 "—".
 */
export function formatTradeListDatetime(iso: string | null | undefined): string {
  return formatMypageDate(iso, { style: "datetime" }) || "—";
}
