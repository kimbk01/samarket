"use client";

/**
 * 거래 화면 「문의하기」 — 거래 문의 카테고리 + 참조 자동 첨부 (거래 Admin 설계 v2 §G-4 · D-29).
 * 참조 소유 확인은 서버 문의 생성 시 `support-reference-authority` 가 한다.
 */
import { navigateToSupportCenter } from "@/lib/support/open-support-center";
import { buildMemberSupportContext } from "@/lib/support/support-context";

export function openTradeSupport(input: {
  sourceSurface: "trade_post_detail" | "trade_chat_room";
  referenceType: "TRADE_POST" | "TRADE_CHAT_ROOM";
  referenceId: string | null | undefined;
}): boolean {
  const referenceId = String(input.referenceId ?? "").trim();
  return navigateToSupportCenter(
    buildMemberSupportContext({
      enabled: true,
      category: "TRADE",
      sourceSurface: input.sourceSurface,
      ...(referenceId ? { referenceType: input.referenceType, referenceId } : {}),
    })
  );
}
