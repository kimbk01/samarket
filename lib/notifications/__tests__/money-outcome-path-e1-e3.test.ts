/**
 * 재감사 3단계 E-1·E-3·T-1 — 돈 처리 결과 알림이 「항목·소리」와 「열린 화면 재조회」에 끝까지 닿는지(순수 함수 경로).
 * 이전 테스트는 소스 문자열만 봐서 Coin 출금 알림이 항목·소리 표에 빠진 것(E-1)을 잡지 못했다.
 */
import { describe, expect, it } from "vitest";
import {
  MEMBER_MONEY_OUTCOME_KINDS,
  STORE_CASH_CHARGE_OUTCOME_KINDS,
  STORE_COIN_WITHDRAWAL_OUTCOME_KINDS,
  STORE_MONEY_OUTCOME_KINDS,
  moneyOutcomeFromNotificationRow,
  moneyOutcomeMatchesScope,
} from "@/lib/notifications/money-outcome-signal";
import { resolveNotificationItem } from "@/lib/notifications/notification-item-registry";
import { getRegistryEvent } from "@/lib/notifications/notification-sound-registry";

const STORE = "076bffda-3048-4bfb-80ae-985a69105f4a";

describe("E-1 — 모든 돈 처리 결과 종류는 알림 항목·전용 소리 키가 있다", () => {
  it.each([...STORE_MONEY_OUTCOME_KINDS])("매장 %s → 사장님 항목 + item_ 소리 키", (kind) => {
    const item = resolveNotificationItem({ eventType: "admin_notice", kind, legacyNotificationType: "system" });
    expect(item, kind).toBeTruthy();
    expect(item!.audience).toBe("owner");
    expect(item!.soundEventKey?.startsWith("item_owner_"), `${kind} → ${item!.soundEventKey}`).toBe(true);
    expect(getRegistryEvent(item!.soundEventKey!), item!.soundEventKey!).toBeTruthy();
  });

  it("Coin 출금 결과 = 「Coin 출금 결과」 항목 · 지금 소리는 공지 소리 그대로(대체 키)", () => {
    for (const kind of STORE_COIN_WITHDRAWAL_OUTCOME_KINDS) {
      const item = resolveNotificationItem({ eventType: "admin_notice", kind });
      expect(item?.key).toBe("owner_coin_withdrawal");
      const ev = getRegistryEvent("item_owner_coin_withdrawal")!;
      expect(ev.fallback_event_key).toBe("admin_notice_received");
      expect(ev.android_channel_id).toBe(getRegistryEvent("admin_notice_received")!.android_channel_id);
    }
  });
});

describe("E-3 — 알림 행 → 신호 → 화면별 종류 거르기", () => {
  const row = (kind: string, storeId: string | null) =>
    moneyOutcomeFromNotificationRow({ event_kind: kind, meta: { kind, ...(storeId ? { store_id: storeId } : {}) } })!;

  it("Coin 출금 반려 → 출금 패널·재무 홈은 다시 읽고, 정산(수수료·캐시) 화면은 안 읽는다", () => {
    const sig = row("store_coin_withdrawal_rejected", STORE);
    expect(moneyOutcomeMatchesScope(sig, { storeId: STORE, kinds: STORE_COIN_WITHDRAWAL_OUTCOME_KINDS })).toBe(true);
    expect(moneyOutcomeMatchesScope(sig, { storeId: STORE, kinds: STORE_MONEY_OUTCOME_KINDS })).toBe(true);
    expect(moneyOutcomeMatchesScope(sig, { storeId: STORE, kinds: STORE_CASH_CHARGE_OUTCOME_KINDS })).toBe(false);
  });

  it("Cash 충전 승인 → 정산·Cash 화면은 다시 읽고, 출금 패널·상품권 패널은 안 읽는다", () => {
    const sig = row("delivery_ad_business_cash_charge_completed", STORE);
    expect(moneyOutcomeMatchesScope(sig, { storeId: STORE, kinds: STORE_CASH_CHARGE_OUTCOME_KINDS })).toBe(true);
    expect(moneyOutcomeMatchesScope(sig, { storeId: STORE, kinds: STORE_COIN_WITHDRAWAL_OUTCOME_KINDS })).toBe(false);
  });

  it("다른 매장·회원 신호는 종류가 맞아도 받지 않는다", () => {
    expect(
      moneyOutcomeMatchesScope(row("store_coin_withdrawal_paid", "other-store"), {
        storeId: STORE,
        kinds: STORE_MONEY_OUTCOME_KINDS,
      })
    ).toBe(false);
    const member = row("user_point_charge_approved", null);
    expect(moneyOutcomeMatchesScope(member, { storeId: null, kinds: MEMBER_MONEY_OUTCOME_KINDS })).toBe(true);
    expect(moneyOutcomeMatchesScope(member, { storeId: STORE, kinds: STORE_MONEY_OUTCOME_KINDS })).toBe(false);
  });

  it("종류 묶음 = 매장 전체의 나눔 (빠진 종류 없음)", () => {
    expect(new Set([...STORE_CASH_CHARGE_OUTCOME_KINDS, ...STORE_COIN_WITHDRAWAL_OUTCOME_KINDS])).toEqual(
      STORE_MONEY_OUTCOME_KINDS
    );
  });
});
