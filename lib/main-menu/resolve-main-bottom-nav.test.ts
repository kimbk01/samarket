import { describe, expect, it } from "vitest";
import {
  resolveMainBottomNavDisplayItems,
  validateMainBottomNavPayload,
} from "@/lib/main-menu/resolve-main-bottom-nav";

describe("resolveMainBottomNavDisplayItems", () => {
  it("빈 값이면 기본 6탭 노출", () => {
    const items = resolveMainBottomNavDisplayItems(null);
    expect(items.map((i) => i.id)).toEqual([
      "home",
      "community",
      "stores",
      "orders",
      "chat",
      "my",
    ]);
  });

  it("DB에 주문 탭 없이 저장된 예전 5탭이면 orders를 끼워 넣음", () => {
    const items = resolveMainBottomNavDisplayItems({
      items: [
        { id: "home", visible: true, label: "홈", href: "/home", icon: "home" },
        { id: "community", visible: true, label: "동네생활", href: "/community", icon: "community" },
        { id: "stores", visible: true, label: "매장", href: "/stores", icon: "stores" },
        { id: "chat", visible: true, label: "채팅", href: "/chats", icon: "chat" },
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
      ],
    });
    expect(items.map((i) => i.id)).toEqual([
      "home",
      "community",
      "stores",
      "orders",
      "chat",
      "my",
    ]);
    expect(items.find((i) => i.id === "orders")?.href).toBe("/orders");
  });

  it("레거시 5내장이 순서만 바뀐 경우에도 orders는 바로 다음 탭(chat) 앞에 삽입", () => {
    const items = resolveMainBottomNavDisplayItems({
      items: [
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
        { id: "chat", visible: true, label: "채팅", href: "/chats", icon: "chat" },
        { id: "stores", visible: true, label: "매장", href: "/stores", icon: "stores" },
        { id: "community", visible: true, label: "동네생활", href: "/community", icon: "community" },
        { id: "home", visible: true, label: "홈", href: "/home", icon: "home" },
      ],
    });
    expect(items.map((i) => i.id)).toEqual([
      "my",
      "orders",
      "chat",
      "stores",
      "community",
      "home",
    ]);
  });
});

describe("validateMainBottomNavPayload", () => {
  it("순서 바꾼 5개·전부 노출 허용", () => {
    const body = {
      items: [
        { id: "my", visible: true, label: "내정보", href: "/mypage", icon: "my" },
        { id: "chat", visible: true, label: "채팅", href: "/chats", icon: "chat" },
        { id: "stores", visible: true, label: "매장", href: "/stores", icon: "stores" },
        { id: "community", visible: true, label: "동네생활", href: "/community", icon: "community" },
        { id: "home", visible: true, label: "홈", href: "/home", icon: "home" },
      ],
    };
    const v = validateMainBottomNavPayload(body);
    expect(v.ok).toBe(true);
    if (v.ok) {
      const vis = resolveMainBottomNavDisplayItems(v.payload);
      expect(vis.map((i) => i.id)).toEqual([
        "my",
        "orders",
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
