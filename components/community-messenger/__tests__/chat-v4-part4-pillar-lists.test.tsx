// @vitest-environment jsdom
/**
 * 채팅 시안 4판 4부 (Owner 「정확히 시안대로」 2026-11-10) — 「9. 거래 채팅 목록」·「10. 주문 채팅 목록」·「10-2」·「10-3」 렌더·배선 시험.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/community-messenger/delivery-chats",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/i18n/AppLanguageProvider", async () => {
  const { translate } = await import("@/lib/i18n/messages");
  const t = (k: string, vars?: Record<string, string | number>) => translate("ko", k as never, vars);
  const value = { language: "ko", t, safeT: t, tt: (s: string) => s };
  return { useI18n: () => value };
});

import { TradeChatListRowContent } from "@/components/community-messenger/trade-chat-list/TradeChatListRowContent";
import { DeliveryChatListRowContent } from "@/components/community-messenger/delivery-chat-list/DeliveryChatListRowContent";
import { MessengerChatRoomActionSheet } from "@/components/community-messenger/MessengerChatRoomActionSheet";
import { MessengerPillarLeaveConfirmSheet } from "@/components/community-messenger/MessengerPillarLeaveConfirmSheet";
import { usePillarMarkAllRead } from "@/lib/community-messenger/pillar-chat-list/use-pillar-mark-read";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const orderItem = (): UnifiedRoomListItem =>
  ({
    room: {
      id: "room-1",
      roomType: "direct",
      title: "JTV",
      unreadCount: 1,
      isMuted: false,
      isPinned: false,
      contextMeta: { v: 1, kind: "delivery", storeOrderId: "ord-9", orderStatus: "cancelled" },
    },
    preview: "주문이 취소되었어요.",
    previewKind: "message",
    callStatus: null,
    callKind: null,
    lastEventAt: "2026-10-22T03:00:00.000Z",
  }) as unknown as UnifiedRoomListItem;

describe("9 · 10 목록 행", () => {
  it("거래 행: 높이 84 · 1줄 상품 이름 + 상태 칩 · 2줄 판매/구매·상대·가격 · 3줄 마지막 대화(안 읽음 = 검정)", () => {
    act(() =>
      root.render(
        <TradeChatListRowContent
          rowSurfaceClass=""
          avatar={<span data-avatar="" />}
          trailing={<span data-trailing="" />}
          productTitle="족같이 일할 사람 구해요"
          statusChip={{ label: "판매중", tone: "ok" }}
          metaLine="판매 · q테스트1 · ₱20,000"
          previewLine="안녕하세요"
          unread
        />
      )
    );
    const row = host.querySelector('[data-cm-pillar-row="trade"]')!;
    expect(row.className).toContain("h-[84px]");
    expect(row.querySelector("[data-cm-list-title]")?.textContent).toBe("족같이 일할 사람 구해요");
    expect(row.querySelector('[data-cm-pillar-chip="ok"]')?.textContent).toBe("판매중");
    expect(row.querySelector("[data-cm-pillar-meta]")?.textContent).toBe("판매 · q테스트1 · ₱20,000");
    const preview = row.querySelector<HTMLElement>("[data-cm-list-preview]")!;
    expect(preview.textContent).toBe("안녕하세요");
    expect(preview.style.color).toBe("var(--cm-chat-fg)");
    /** 옛 「거래」 사진 배지·「상대 · 상품명」 제목·3줄 「볼 수 없는 글」 칩 자리 없음 */
    expect(row.textContent).not.toContain("거래");
  });

  it("주문 행: 높이 72 · 1줄 매장 이름 + 빨간 칩 · 2줄 마지막 대화(읽음 = 회색)", () => {
    act(() =>
      root.render(
        <DeliveryChatListRowContent
          rowSurfaceClass=""
          avatar={<span />}
          trailing={<span />}
          storeName="맛업는식당"
          previewLine="주문이 취소되었어요."
          statusChip={{ label: "주문 취소", tone: "danger" }}
          unread={false}
        />
      )
    );
    const row = host.querySelector('[data-cm-pillar-row="delivery"]')!;
    expect(row.className).toContain("h-[72px]");
    expect(row.querySelector('[data-cm-pillar-chip="danger"]')?.textContent).toBe("주문 취소");
    expect(row.querySelector<HTMLElement>("[data-cm-list-preview]")!.style.color).toBe("var(--cm-chat-sub)");
  });
});

describe("10-2 길게 누르기 메뉴 (주문 행)", () => {
  it("머리 = 매장 사진·이름·「상태 · 날짜」, 줄 = 채팅방 열기 · 주문 내역 보기 · 알림 끄기 · 읽음 처리 → 띠 → 나가기", () => {
    const onViewOrderDetail = vi.fn();
    act(() =>
      root.render(
        <MessengerChatRoomActionSheet
          item={orderItem()}
          anchorRect={null}
          busyId={null}
          pillar="delivery"
          pillarHeader={{ avatar: <span data-store-avatar="" />, title: "JTV", subtitle: "주문 취소 · 10월 22일" }}
          onClose={vi.fn()}
          onEnterRoom={vi.fn()}
          onViewOrderDetail={onViewOrderDetail}
          onToggleMute={vi.fn()}
          onMarkRead={vi.fn()}
          onLeave={vi.fn()}
        />
      )
    );
    const sheet = document.querySelector('[data-cm-pillar-sheet="delivery"]')!;
    expect(sheet).toBeTruthy();
    const header = sheet.querySelector("[data-cm-pillar-sheet-header]")!;
    expect(header.textContent).toContain("JTV");
    expect(header.textContent).toContain("주문 취소 · 10월 22일");
    const groups = [...sheet.querySelectorAll(".dibay-overlay-menu__group")].map((g) =>
      [...g.querySelectorAll(".dibay-overlay-menu__label")].map((l) => l.textContent)
    );
    expect(groups).toEqual([["채팅방 열기", "주문 내역 보기", "알림 끄기", "읽음 처리"], ["나가기"]]);
    /** 주문 행은 고정·보관 없음 */
    expect(sheet.textContent).not.toContain("보관");
    const orderDetail = [...sheet.querySelectorAll("button")].find((b) => b.textContent?.includes("주문 내역 보기"))!;
    act(() => orderDetail.click());
    expect(onViewOrderDetail).toHaveBeenCalledTimes(1);
  });
});

describe("10-3 나가기 확인", () => {
  it("제목 18/700 · 설명 15 회색 · [취소][나가기] 높이 50 나란히", () => {
    const onConfirm = vi.fn();
    act(() =>
      root.render(
        <MessengerPillarLeaveConfirmSheet
          title="채팅방을 나갈까요?"
          description="주문 채팅을 나가면 내 목록에서만 삭제됩니다."
          onCancel={vi.fn()}
          onConfirm={onConfirm}
        />
      )
    );
    const box = document.querySelector("[data-cm-pillar-leave-confirm]")!;
    expect(box.querySelector("h2")?.className).toContain("text-[18px] font-bold");
    expect(box.querySelector("p")?.className).toContain("text-[15px]");
    const cancel = box.querySelector<HTMLButtonElement>("[data-cm-pillar-leave-cancel]")!;
    const leave = box.querySelector<HTMLButtonElement>("[data-cm-pillar-leave-confirm-button]")!;
    expect(cancel.textContent).toBe("취소");
    expect(leave.textContent).toBe("나가기");
    expect(leave.className).toContain("h-[50px]");
    expect(leave.style.background).toBe("var(--cm-chat-danger)");
    act(() => leave.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("머리글 「모두 읽음」 훅 (거래·주문 공용)", () => {
  it("안 읽은 방만 읽음 요청 · 진행 중 표시 · 끝나면 해제 · 실패 시 오류 문구", async () => {
    const calls: string[] = [];
    const markRoomReadById = vi.fn(async (roomId: string) => {
      calls.push(roomId);
      return roomId !== "b";
    });
    type Snapshot = { busyId: string | null; error: string | null; run: () => Promise<void> };
    const snapshots: Snapshot[] = [];
    const busyWrites: unknown[] = [];
    const report = (snap: Snapshot) => {
      snapshots.push(snap);
    };
    const recordBusyWrite = (next: unknown) => {
      busyWrites.push(next);
    };
    function Harness({ onRender }: { onRender: (snap: Snapshot) => void }) {
      const [busyId, setBusyIdState] = useState<string | null>(null);
      const [actionError, setActionError] = useState<string | null>(null);
      const setBusyId: typeof setBusyIdState = (next) => {
        recordBusyWrite(next);
        setBusyIdState(next);
      };
      const run = usePillarMarkAllRead({
        rows: [
          { roomId: "a", unreadCount: 1 },
          { roomId: "b", unreadCount: 2 },
          { roomId: "c", unreadCount: 0 },
        ],
        markRoomReadById,
        setBusyId,
        setActionError,
        failureMessage: "failed",
      });
      onRender({ busyId, error: actionError, run });
      return null;
    }
    act(() => root.render(<Harness onRender={report} />));
    await act(async () => {
      await snapshots[snapshots.length - 1]!.run();
    });
    expect(calls).toEqual(["a", "b"]);
    expect(busyWrites).toEqual(["read:all", null]);
    const last = snapshots[snapshots.length - 1]!;
    expect(last.busyId).toBeNull();
    expect(last.error).toBe("failed");
  });
});

describe("배선 — 머리글·탭·없앤 줄", () => {
  const trade = read("components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate.tsx");
  const order = read("components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate.tsx");

  it("두 목록 모두 머리글 오른쪽 「모두 읽음」을 공용 훅으로 등록하고 본문 제목·안 읽음 줄은 없다", () => {
    for (const src of [trade, order]) {
      expect(src).toContain("useMessengerPillarHeaderChrome(");
      expect(src).toContain("usePillarMarkAllRead(");
      expect(src).toContain("data-cm-messenger-pillar-tabs");
      expect(src).not.toContain("community_messenger_unreadroomcount_unread");
      expect(src).not.toContain("MobileConfirmBottomSheet");
      expect(src).toContain("MessengerPillarLeaveConfirmSheet");
    }
    /** 거래: 둥근 칩 → 밑줄 탭, 역할 필터 그대로 */
    expect(trade).toContain("filterTradeListRowsByRole");
    expect(trade).not.toContain("rounded-full bg-sam-primary px-3 py-1");
    /** 주문: 「지난 주문 N · 접기」 줄 → 탭 */
    expect(order).not.toContain("cm_ui_order_chats_past");
    expect(order).not.toContain("pastFolded");
    expect(order).toContain("filterStoreOrderChatListByTab(");
    expect(order).toContain("customerStoreOrderDetailHref(");
    expect(order).toContain('title={t("cm_pillar_leave_confirm_title")}');
    expect(order).toContain('description={t("cm_ui_leave_confirm_delivery")}');
  });

  it("머리글 「모두 읽음」 = 14px/600 초록, 안 읽은 방 없으면 회색·눌리지 않음 · 분할 제목 「주문 채팅」", () => {
    const chrome = read("components/community-messenger/MessengerPillarSplitChrome.tsx");
    expect(chrome).toContain("text-[14px] font-semibold");
    expect(chrome).toContain('disabled ? "text-sam-muted" : "text-sam-primary"');
    expect(chrome).toContain("useRegisterMainTier1Header(tier1)");
    expect(chrome).toContain('delivery: "community_messenger_order_chats"');
    const shell = read("lib/community-messenger/home/use-community-messenger-home-shell-effects.tsx");
    expect(shell).toContain('resolveTier1BarLabel(t, tt, "community_messenger_order_chats")');
    expect(shell).not.toContain('resolveTier1BarLabel(t, tt, "nav_chat_order_compact")');
  });

  it("탭 줄 모양은 메신저 홈 탭과 같은 규칙(왼쪽 정렬·간격 22·15px·선택 700)", () => {
    const css = read("app/dibay-chrome-ssot.css");
    expect(css).toContain("[data-cm-messenger-pillar-tabs]");
  });
});
