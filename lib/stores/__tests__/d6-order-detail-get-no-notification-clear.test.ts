/**
 * D6 (Owner 「D6 구현 승인」 2026-11-09) — 주문 상세 조회(GET)는 알림을 읽음 처리하지 않는다.
 * 읽음은 사용자가 실제로 본 화면(상세 페이지·펼침 패널·매장 주문 상세)과 주문 채팅 읽음이 명시적으로 보낸다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("D6 주문 상세 GET — 쓰기 0", () => {
  const route = read("app/api/me/store-orders/[orderId]/route.ts");
  const getHandler = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function PATCH"));

  it("GET 안에서 알림 대상 읽음(clearNotificationTarget) 호출 없음", () => {
    expect(getHandler.length).toBeGreaterThan(100);
    expect(getHandler).not.toContain("clearNotificationTarget");
    expect(getHandler).not.toContain("notification-targets");
  });
});

describe("D6 사용자가 실제로 본 화면만 명시적 읽음", () => {
  const cases: Array<[string, string]> = [
    ["주문 상세 페이지", "components/mypage/MyStoreOrderDetailView.tsx"],
    ["펼침 패널", "components/mypage/MyStoreOrderExpandPanel.tsx"],
    ["매장 주문 상세", "components/stores/StoreCommerceOrderDetailClient.tsx"],
  ];
  for (const [label, file] of cases) {
    it(`${label}: read-thread(order_detail_opened) 1회 — 주문당 once-guard`, () => {
      const src = read(file);
      expect(src).toContain("postNotificationThreadRead(orderId");
      expect(src).toContain('readReason: "order_detail_opened"');
      expect(src).toMatch(/ReadOnceRef\.current === orderId/);
    });
  }

  it("주문 목록 마우스 올림·포커스 미리받기는 읽음을 보내지 않음", () => {
    const list = read("components/mypage/MyStoreOrdersView.tsx");
    expect(list).not.toContain("postNotificationThreadRead");
    expect(list).not.toContain("clearNotificationTarget");
  });
});
