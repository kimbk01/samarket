import { describe, expect, it } from "vitest";
import {
  parseStoreOrderAcceptedPrepMinutes,
  resolveStoreOrderOpsBodyText,
  resolveStoreOrderOpsTitleText,
  storeOrderOpsStatusTitleKey,
} from "@/lib/store-order-chat/store-order-ops-i18n";

const ko = (key: string, vars?: Record<string, string | number>) => {
  const map: Record<string, string> = {
    store_delivery_ops_title_accepted: "주문 접수",
    store_delivery_ops_body_accepted: "주문을 접수 했습니다.",
    store_delivery_ops_body_accepted_prep: "주문을 접수 했습니다. 예상 준비 시간은 약 {minutes}분입니다.",
    store_delivery_ops_body_preparing: "주문을 준비(조리) 중입니다.",
    store_delivery_ops_body_completed_pickup: "주문이 완료되었습니다. 픽업해 주세요.",
  };
  let s = map[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  }
  return s;
};

describe("store-order-ops-i18n", () => {
  it("parses prep minutes from legacy content", () => {
    expect(parseStoreOrderAcceptedPrepMinutes("주문을 접수 했습니다. 예상 준비 시간은 약 10분입니다.")).toBe(10);
  });

  it("resolves accepted body with prep", () => {
    const body = resolveStoreOrderOpsBodyText({
      orderStatus: "accepted",
      lineKind: "status",
      content: "주문을 접수 했습니다. 예상 준비 시간은 약 10분입니다.",
      metadata: null,
      t: ko,
    });
    expect(body).toContain("10");
  });

  it("maps status to title key", () => {
    expect(storeOrderOpsStatusTitleKey("preparing", "status")).toBe("store_delivery_ops_title_preparing");
  });

  it("never returns raw i18n key as title", () => {
    const title = resolveStoreOrderOpsTitleText({
      orderStatus: "accepted",
      lineKind: "status",
      t: ko,
    });
    expect(title).not.toContain("store_delivery_ops_");
    expect(title).toBe("주문 접수");
  });

  it("prefers metadata message_key over legacy content", () => {
    const body = resolveStoreOrderOpsBodyText({
      orderStatus: "preparing",
      lineKind: "status",
      content: "legacy ko text",
      metadata: { message_key: "store_delivery_ops_body_preparing" },
      t: ko,
    });
    expect(body).toContain("준비");
    expect(body).not.toBe("legacy ko text");
  });

  it("translates body when DB stored the key string", () => {
    const body = resolveStoreOrderOpsBodyText({
      orderStatus: "preparing",
      lineKind: "status",
      content: "store_delivery_ops_body_preparing",
      metadata: null,
      t: ko,
    });
    expect(body).not.toContain("store_delivery_ops_");
    expect(body).toContain("준비");
  });
});
