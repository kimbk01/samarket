import { describe, expect, it } from "vitest";
import {
  isUnusableStoreOrderDisplayName,
  resolveStoreOrderDisplayIdentity,
  STORE_ORDER_DISPLAY_STORE_FALLBACK,
} from "@/lib/community-messenger/store-order-display-identity";
import { afterEach as afterEachRuntimeLang, beforeEach as beforeEachRuntimeLang } from "vitest";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

/** 언어 재감사 2026-11-27 — 라벨은 화면 언어(런타임)로 그린다. 이 파일의 한국어 기대값은 ko 화면 기준 */
beforeEachRuntimeLang(() => setRuntimeAppLanguage("ko"));
afterEachRuntimeLang(() => setRuntimeAppLanguage("en"));

describe("resolveStoreOrderDisplayIdentity", () => {
  it("uses storeDisplayName from delivery meta", () => {
    const id = resolveStoreOrderDisplayIdentity({
      summary: "",
      messengerDirectKey: null,
      contextMeta: {
        v: 1,
        kind: "delivery",
        storeDisplayName: "맛업는식당",
        storeId: "s1",
      },
    });
    expect(id?.storeName).toBe("맛업는식당");
    expect(id?.hasResolvedStoreName).toBe(true);
  });

  it("does not use GENERAL placeholder as store name", () => {
    const id = resolveStoreOrderDisplayIdentity({
      summary: "",
      messengerDirectKey: null,
      contextMeta: {
        v: 1,
        kind: "delivery",
        storeDisplayName: "새 대화",
        storeId: "s1",
      },
    });
    expect(id?.storeName).toBe(STORE_ORDER_DISPLAY_STORE_FALLBACK);
    expect(id?.hasResolvedStoreName).toBe(false);
    expect(isUnusableStoreOrderDisplayName("New conversation")).toBe(true);
  });
});
