import { describe, expect, it } from "vitest";
import {
  resolveMainBottomNavDisplayItems,
  validateMainBottomNavPayload,
} from "@/lib/main-menu/resolve-main-bottom-nav";

describe("resolveMainBottomNavDisplayItems", () => {
  it("빈 값이면 기본 5탭 노출", () => {
    const items = resolveMainBottomNavDisplayItems(null);
    expect(items.map((i) => i.id)).toEqual(["community", "home", "stores", "chat", "my"]);
    expect(items.find((i) => i.id === "home")).toMatchObject({
      label: "Trade",
      labelKey: "nav.trade",
      icon: "trade",
    });
    expect(items.find((i) => i.id === "chat")).toMatchObject({
      href: "/community-messenger?section=chats&inbox=unread",
      labelKey: "nav.chat",
    });
  });

  it("DB에 저장된 예전 6탭이면 orders를 제거하고 5축만 노출", () => {
    const items = resolveMainBottomNavDisplayItems({
      items: [
        { id: "home", visible: true, label: "TRADE", href: "/market", icon: "trade" },
        { id: "community", visible: true, label: "커뮤니티", href: "/philife", icon: "community" },
        { id: "stores", visible: true, label: "매장", href: "/stores", icon: "stores" },
        { id: "orders", visible: true, label: "주문", href: "/orders", icon: "orders" },
        { id: "chat", visible: true, label: "채팅", href: "/community-messenger", icon: "chat" },
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
    expect(items.find((i) => i.id === "chat")?.href).toBe(
      "/community-messenger?section=chats&inbox=unread"
    );
  });

  it("현재 5내장 저장본은 순서를 그대로 유지", () => {
    const items = resolveMainBottomNavDisplayItems({
      items: [
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
        { id: "chat", visible: true, label: "채팅", href: "/community-messenger", icon: "chat" },
        { id: "stores", visible: true, label: "매장", href: "/stores", icon: "stores" },
        { id: "community", visible: true, label: "커뮤니티", href: "/philife", icon: "community" },
        { id: "home", visible: true, label: "TRADE", href: "/market", icon: "trade" },
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

  it("메신저 탭 href 가 친구·보관함 등이어도 하단 탭은 채팅 섹션으로 통일", () => {
    const items = resolveMainBottomNavDisplayItems({
      items: [
        { id: "community", visible: true, label: "커뮤니티", href: "/philife", icon: "community" },
        { id: "home", visible: true, label: "거래", href: "/market", icon: "trade" },
        { id: "stores", visible: true, label: "배달", href: "/stores", icon: "stores" },
        { id: "chat", visible: true, label: "메신저", href: "/community-messenger?section=friends", icon: "chat" },
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
      ],
    });
    expect(items.find((i) => i.id === "chat")?.href).toBe(
      "/community-messenger?section=chats&inbox=unread"
    );
  });

  it("거래 탭에 예전 icon=home 저장본이면 trade 아이콘으로 승격", () => {
    const items = resolveMainBottomNavDisplayItems({
      items: [
        { id: "home", visible: true, label: "TRADE", href: "/market", icon: "home" },
        { id: "community", visible: true, label: "커뮤니티", href: "/philife", icon: "community" },
        { id: "stores", visible: true, label: "매장", href: "/stores", icon: "stores" },
        { id: "chat", visible: true, label: "채팅", href: "/community-messenger", icon: "chat" },
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
      ],
    });
    expect(items.find((i) => i.id === "home")).toMatchObject({ icon: "trade" });
  });

  it("거래 탭 href=/market 저장본을 유지", () => {
    const items = resolveMainBottomNavDisplayItems({
      items: [
        { id: "home", visible: true, label: "거래", href: "/market", icon: "trade" },
        { id: "community", visible: true, label: "커뮤니티", href: "/philife", icon: "community" },
        { id: "stores", visible: true, label: "배달", href: "/stores", icon: "stores" },
        { id: "chat", visible: true, label: "채팅", href: "/community-messenger", icon: "chat" },
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
      ],
    });
    expect(items.find((i) => i.id === "home")?.href).toBe("/market");
  });

  it("저장본에서 내장 탭 행이 빠졌으면 기본값으로 끝에 복구(내정보 등)", () => {
    const items = resolveMainBottomNavDisplayItems({
      items: [
        { id: "community", visible: true, label: "커뮤니티", href: "/philife", icon: "community" },
        { id: "home", visible: true, label: "거래", href: "/market", icon: "trade" },
        { id: "stores", visible: true, label: "배달", href: "/stores", icon: "stores" },
        { id: "chat", visible: true, label: "메신저", href: "/community-messenger", icon: "chat" },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["community", "home", "stores", "chat", "my"]);
    expect(items.find((i) => i.id === "my")).toMatchObject({
      href: "/mypage",
      label: "My",
      labelKey: "nav.my",
      icon: "my",
    });
  });

  it("custom_* 탭이 있으면 빠진 내장 탭을 자동 채우지 않음", () => {
    const items = resolveMainBottomNavDisplayItems({
      items: [
        { id: "home", visible: true, label: "홈", href: "/market", icon: "home" },
        {
          id: "custom_x1",
          visible: true,
          label: "서비스",
          href: "/services",
          icon: "stores",
        },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["home", "custom_x1"]);
  });
});

describe("validateMainBottomNavPayload", () => {
  it("순서 바꾼 5개·전부 노출 허용", () => {
    const body = {
      items: [
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
        { id: "chat", visible: true, label: "채팅", href: "/community-messenger", icon: "chat" },
        { id: "stores", visible: true, label: "매장", href: "/stores", icon: "stores" },
        { id: "community", visible: true, label: "커뮤니티", href: "/philife", icon: "community" },
        { id: "home", visible: true, label: "TRADE", href: "/market", icon: "trade" },
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
        { id: "home", visible: true, label: "홈", href: "/market", icon: "home" },
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
      href: "/market",
      icon: "home" as const,
    }));
    expect(validateMainBottomNavPayload({ items }).ok).toBe(false);
  });

  it("lucideIcon 저장·표시 items 에 반영", () => {
    const body = {
      items: [
        {
          id: "community",
          visible: true,
          label: "커뮤니티",
          href: "/philife",
          icon: "community",
          lucideIcon: "List",
        },
        { id: "home", visible: true, label: "거래", href: "/market", icon: "trade" },
        { id: "stores", visible: true, label: "배달", href: "/stores", icon: "stores" },
        { id: "chat", visible: true, label: "채팅", href: "/community-messenger", icon: "chat" },
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
      ],
    };
    const v = validateMainBottomNavPayload(body);
    expect(v.ok).toBe(true);
    if (v.ok) {
      const items = resolveMainBottomNavDisplayItems(v.payload);
      expect(items.find((i) => i.id === "community")?.lucideIcon).toBe("List");
    }
  });

  it("허용되지 않은 lucideIcon 은 거부", () => {
    const body = {
      items: [
        {
          id: "home",
          visible: true,
          label: "거래",
          href: "/market",
          icon: "trade",
          lucideIcon: "NotARealIcon",
        },
      ],
    };
    expect(validateMainBottomNavPayload(body).ok).toBe(false);
  });

  it("fab 설정 저장·표시 items 에 반영", () => {
    const body = {
      items: [
        {
          id: "stores",
          visible: true,
          label: "배달",
          href: "/stores",
          icon: "stores",
          fab: {
            enabled: true,
            items: [
              {
                id: "fab_delivery_orders",
                visible: true,
                label: "주문내역",
                href: "/orders",
                icon: "orders",
              },
            ],
          },
        },
      ],
    };
    const v = validateMainBottomNavPayload(body);
    expect(v.ok).toBe(true);
    if (v.ok) {
      const items = resolveMainBottomNavDisplayItems(v.payload);
      expect(items[0]?.fab?.enabled).toBe(true);
      expect(items[0]?.fab?.items[0]?.href).toBe("/orders");
    }
  });
});
