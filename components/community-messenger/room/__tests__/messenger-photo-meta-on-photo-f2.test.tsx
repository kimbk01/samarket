// @vitest-environment jsdom
/**
 * F2 (O10 텔레그램 기준) — 사진 말풍선의 시간·읽음 표시는 사진 오른쪽 아래에 얹는다.
 * 2026-11-16 측정: 시간·「안 읽음」이 사진 옆 같은 줄에 있어 읽음 변화 때 사진 폭 207↔238px · 묶음 높이 155↔179px 가 바뀌었다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MessengerTimelineVirtualRow,
  type MessengerTimelineVirtualRowProps,
} from "@/components/community-messenger/room/phase2/MessengerTimelineVirtualRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/community-messenger/rooms/r1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, language: "ko" }),
}));

function props(item: Record<string, unknown>, over: Partial<MessengerTimelineVirtualRowProps> = {}): MessengerTimelineVirtualRowProps {
  return {
    item: item as never,
    virtualStart: 0,
    virtualIndex: 0,
    directLayout: true,
    measureElement: () => {},
    rowPaddingTopClass: "",
    showPeerName: false,
    showPeerAvatar: false,
    showBubbleTail: false,
    showMessageTime: true,
    dayDividerLabel: null,
    peerAvatar: null,
    streamRoomId: "r1",
    outboundReadState: "unread",
    timelineHighlightMessageId: null,
    messageActionItemId: null,
    mediaAutoSaveEnabled: false,
    voiceCallLabel: "voice",
    videoCallLabel: "video",
    callStatusLabel: "",
    stubBusy: false,
    senderLabelDisplay: "me",
    onOpenImageLightbox: vi.fn(),
    onReactionRosterOpen: vi.fn(),
    setMessageActionItem: vi.fn() as never,
    onCallStubRedial: vi.fn(),
    messageLongPressTimerRef: { current: null },
    messageLongPressItemRef: { current: null },
    focusTimelineMessage: vi.fn(),
    tt: ((s: string) => s) as never,
    t: (k: string) => k,
    clockLanguage: "ko",
    ...over,
  };
}

const photo = {
  id: "8c048d6c-a604-40b8-8c36-75b49e5cd2ed",
  roomId: "r1",
  senderId: "u1",
  senderLabel: "me",
  messageType: "image",
  content: "https://x.supabase.co/storage/v1/object/public/messenger-media/u/a.thumb.webp",
  imageWidth: 1600,
  imageHeight: 1200,
  createdAt: "2026-11-16T00:00:00.000Z",
  isMine: true,
};

describe("사진 위 시간·읽음 (F2)", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("내 사진: 시간·상태 아이콘이 사진 위 칸 안에 있고, 사진 옆 줄에는 없다", () => {
    act(() => root.render(<MessengerTimelineVirtualRow {...props(photo)} />));
    const meta = host.querySelector("[data-cm-photo-meta]") as HTMLElement | null;
    expect(meta).not.toBeNull();
    expect(meta!.querySelector('[data-cm-outbound-status="sent"]')!.getAttribute("aria-label")).toBe("cm_ui_unread");
    // 사진 말풍선 칸 안(같은 상대 위치 상자)에 들어 있다
    expect(meta!.parentElement!.querySelector("[data-cm-photo-bubble]")).not.toBeNull();
    // 사진 옆 줄의 독립 상태 표시는 없다(읽음 변화가 폭을 바꾸지 않게)
    const side = [...host.querySelectorAll("[data-cm-outbound-status]")].filter((s) => !s.closest("[data-cm-photo-meta]"));
    expect(side).toHaveLength(0);
  });

  it("읽음 표시가 바뀌어도 사진 말풍선 폭 지정이 같다", () => {
    act(() => root.render(<MessengerTimelineVirtualRow {...props(photo, { outboundReadState: "unread" })} />));
    const w1 = (host.querySelector("[data-cm-photo-bubble]") as HTMLElement).style.width;
    act(() => root.render(<MessengerTimelineVirtualRow {...props(photo, { outboundReadState: "read" })} />));
    const w2 = (host.querySelector("[data-cm-photo-bubble]") as HTMLElement).style.width;
    expect(w1).toBe(w2);
    expect(host.querySelector('[data-cm-photo-meta] [data-cm-outbound-status="read"]')).not.toBeNull();
  });

  it("P1: 글 말풍선도 시간·상태를 말풍선 안 오른쪽 아래에 (옆 줄 없음)", () => {
    act(() =>
      root.render(
        <MessengerTimelineVirtualRow {...props({ ...photo, messageType: "text", content: "hi", imageWidth: undefined })} />
      )
    );
    expect(host.querySelector("[data-cm-photo-meta]")).toBeNull();
    const meta = host.querySelector("[data-cm-text-meta]") as HTMLElement;
    expect(meta).not.toBeNull();
    expect(meta.closest("[data-cm-message-id]")).not.toBeNull();
    expect(host.textContent).not.toContain("cm_ui_unread");
    expect(meta.querySelector('[data-cm-outbound-status="sent"]')).not.toBeNull();
  });

  it("P1 F-img: 실패한 사진 행은 회전·「전송 중」 없이 실패 표시", () => {
    act(() =>
      root.render(
        <MessengerTimelineVirtualRow
          {...props({ ...photo, id: "pending:image:r1:3", pending: true, sendFailed: true }, { outboundReadState: "none" })}
        />
      )
    );
    expect(host.querySelector(".sam-spinner")).toBeNull();
    expect(host.textContent).not.toContain("common_sending");
    expect(host.querySelector('[data-cm-photo-meta] [data-cm-outbound-status="failed"]')).not.toBeNull();
    expect(host.querySelector("[data-cm-outbound-failed]")).not.toBeNull();
  });

  it("보내는 중 사진 행은 회전 표시 + 시계 아이콘", () => {
    act(() =>
      root.render(
        <MessengerTimelineVirtualRow
          {...props({ ...photo, id: "pending:image:r1:4", pending: true }, { outboundReadState: "none" })}
        />
      )
    );
    expect(host.querySelector(".sam-spinner")).not.toBeNull();
    expect(host.querySelector('[data-cm-photo-meta] [data-cm-outbound-status="sending"]')).not.toBeNull();
  });
});
