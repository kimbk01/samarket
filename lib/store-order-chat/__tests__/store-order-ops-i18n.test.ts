import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import {
  parseStoreOrderAcceptedPrepMinutes,
  resolveStoreOrderOpsBodyText,
  resolveStoreOrderOpsTitleText,
  storeOrderMessengerEventLine,
} from "@/lib/store-order-chat/store-order-ops-i18n";

const ko = (key: string, vars?: Record<string, string | number>) =>
  translate("ko", key as never, vars as Record<string, string> | undefined);

/** 주문 채팅 사건 줄 = 4단계 정본 문장 (Owner 2026-11-04 · 설계안 v2 §3-3) */
describe("store-order-ops-i18n", () => {
  it("parses prep minutes from legacy content", () => {
    expect(parseStoreOrderAcceptedPrepMinutes("주문을 접수 했습니다. 예상 준비 시간은 약 10분입니다.")).toBe(10);
  });

  it("예전 접수 줄도 새 문장으로 (예상 조리 시간 유지)", () => {
    const body = resolveStoreOrderOpsBodyText({
      orderStatus: "accepted",
      lineKind: "status",
      content: "주문을 접수했습니다. 예상 준비 시간은 약 10분입니다.",
      metadata: { message_key: "store_delivery_ops_body_accepted_prep", message_vars: { minutes: 10 } },
      t: ko,
    });
    expect(body).toBe("매장이 주문을 접수했어요. 예상 조리 시간 약 10분");
  });

  it("사건 줄 머리 없음 (경고 줄만 머리)", () => {
    expect(resolveStoreOrderOpsTitleText({ orderStatus: "accepted", lineKind: "status", t: ko })).toBe("");
    expect(resolveStoreOrderOpsTitleText({ orderStatus: "accepted", lineKind: "warning", t: ko })).not.toBe("");
  });

  it("저장된 order_event_* 키 우선", () => {
    const body = resolveStoreOrderOpsBodyText({
      orderStatus: "cancelled",
      lineKind: "status",
      content: "x",
      metadata: { message_key: "order_event_rejected_reason", message_vars: { reason: "재료 소진" } },
      t: ko,
    });
    expect(body).toBe("매장이 주문을 거절했어요. 사유: 재료 소진");
  });

  it("배달 4단계 문장", () => {
    expect(["accepted", "preparing", "delivering", "completed"].map((s) => storeOrderMessengerEventLine(s, "delivery")?.content)).toEqual([
      "매장이 주문을 접수했어요.",
      "조리를 시작했어요.",
      "배달을 출발했어요.",
      "배달이 완료되었어요.",
    ]);
    expect(storeOrderMessengerEventLine("ready_for_pickup", "delivery")).toBeNull();
    expect(storeOrderMessengerEventLine("arrived", "delivery")).toBeNull();
  });

  it("픽업 4단계 문장", () => {
    expect(storeOrderMessengerEventLine("ready_for_pickup", "pickup")?.content).toBe("준비가 끝났어요. 매장에서 픽업해 주세요.");
    expect(storeOrderMessengerEventLine("completed", "pickup")?.content).toBe("픽업이 완료되었어요.");
  });
});
