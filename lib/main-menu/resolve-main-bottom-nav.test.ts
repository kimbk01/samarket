import { describe, expect, it } from "vitest";
import {
  resolveMainBottomNavDisplayItems,
  validateMainBottomNavPayload,
} from "@/lib/main-menu/resolve-main-bottom-nav";

describe("resolveMainBottomNavDisplayItems", () => {
  it("빈 값이면 기본 5탭 노출", () => {
    const items = resolveMainBottomNavDisplayItems(null);
    expect(items.map((i) => i.id)).toEqual([
      "home",
      "community",
      "stores",
      "chat",
      "my",
    ]);
    expect(items[0]).toMatchObject({ id: "home", label: "거래", icon: "trade" });
  });

  it("DB에 저장된 예전 6탭이면 orders를 제거하고 5축만 노출", () => {
    const items = resolveMainBottomNavDisplayItems({
      items: [
        { id: "home", visible: true, label: "TRADE", href: "/home", icon: "trade" },
        { id: "community", visible: true, label: "커뮤니티", href: "/philife", icon: "community" },
        { id: "stores", visible: true, label: "매장", href: "/stores", icon: "stores" },
        { id: "orders", visible: true, label: "주문", href: "/orders", icon: "orders" },
        { id: "chat", visible: true, label: "채팅", href: "/mypage/trade/chat", icon: "chat" },
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
      ],
    });
    expect(items.map((i) => i.id)).toEqual([
      "home",
      "community",
      "stores",
      "chat",
      "my",
    ]);
  });

  it("현재 5내장 저장본은 순서를 그대로 유지", () => {
    const items = resolveMainBottomNavDisplayItems({
      items: [
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
        { id: "chat", visible: true, label: "채팅", href: "/mypage/trade/chat", icon: "chat" },
        { id: "stores", visible: true, label: "매장", href: "/stores", icon: "stores" },
        { id: "community", visible: true, label: "커뮤니티", href: "/philife", icon: "community" },
        { id: "home", visible: true, label: "TRADE", href: "/home", icon: "trade" },
      ],
    });
    expect(items.map((i) => i.id)).toEqual([
      "my",
      "chat",
      "stores",
      "community",
      "home",
    ]);
  });

  it("거래 탭에 예전 icon=home 저장본이면 trade 아이콘으로 승격", () => {
    const items = resolveMainBottomNavDisplayItems({
      items: [
        { id: "home", visible: true, label: "TRADE", href: "/home", icon: "home" },
        { id: "community", visible: true, label: "커뮤니티", href: "/philife", icon: "community" },
        { id: "stores", visible: true, label: "매장", href: "/stores", icon: "stores" },
        { id: "chat", visible: true, label: "채팅", href: "/mypage/trade/chat", icon: "chat" },
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
      ],
    });
    expect(items.find((i) => i.id === "home")).toMatchObject({ icon: "trade" });
  });
});

describe("validateMainBottomNavPayload", () => {
  it("순서 바꾼 5개·전부 노출 허용", () => {
    const body = {
      items: [
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
        { id: "chat", visible: true, label: "채팅", href: "/mypage/trade/chat", icon: "chat" },
        { id: "stores", visible: true, label: "매장", href: "/stores", icon: "stores" },
        { id: "community", visible: true, label: "커뮤니티", href: "/philife", icon: "community" },
        { id: "home", visible: true, label: "TRADE", href: "/home", icon: "trade" },
      ],
    };
    const v = validateMainBottomNavPayload(body);
    expect(v.ok).toBe(true);
    if (v.ok) {
      const vis = resolveMainBottomNavDisplayItems(v.payload);
      expect(vis.map((i) => i.id)).toEqual([
        "my",
        "chat",
        "stores",
        "community",
        "home",
      ]);
    }
  });

  it("전부 숨김이면 거부", () => {
    const body = {
      items: [
        { id: "home", visible: false },
        { id: "community", visible: false },
        { id: "stores", visible: false },
        { id: "chat", visible: false },
        { id: "my", visible: false },
      ],
    };
    expect(validateMainBottomNavPayload(body).ok).toBe(false);
  });

  it("custom_* 탭 추가 허용", () => {
    const body = {
      items: [
        { id: "home", visible: true, label: "홈", href: "/home", icon: "home" },
        {
          id: "custom_x1",
          visible: true,
          label: "서비스",
          href: "/services",
          icon: "stores",
        },
      ],
    };
    const v = validateMainBottomNavPayload(body);
    expect(v.ok).toBe(true);
    if (v.ok) {
      const vis = resolveMainBottomNavDisplayItems(v.payload);
      expect(vis.map((i) => i.id)).toEqual(["home", "custom_x1"]);
    }
  });

  it("11개 탭이면 거부", () => {
    const items = Array.from({ length: 11 }, (_, i) => ({
      id: `custom_${i}`,
      visible: true,
      label: `x${i}`,
      href: "/home",
      icon: "home" as const,
    }));
    expect(validateMainBottomNavPayload({ items }).ok).toBe(false);
  });
});
