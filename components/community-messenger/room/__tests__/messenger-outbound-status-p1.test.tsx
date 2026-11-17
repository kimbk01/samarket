// @vitest-environment jsdom
/**
 * P1 전송 상태 SSOT — 상태 아이콘 · 말풍선 안 시간/상태 · 폭 불변 · 스티커 칸 · 실패 행 ·
 * 그룹 「읽음 N명」 메뉴 이동 · 글/스티커 전송 시간 제한 (appendix-P1-send-status-design.md B-9)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MessengerTimelineVirtualRow,
  type MessengerTimelineVirtualRowProps,
} from "@/components/community-messenger/room/phase2/MessengerTimelineVirtualRow";
import {
  MESSENGER_OUTBOUND_STATUS_ICON_BOX_CLASS,
  MessengerOutboundStatusIcon,
} from "@/components/community-messenger/room/phase2/MessengerOutboundStatusIcon";
import { MessageActionMenu } from "@/components/community-messenger/room/message/MessageActionMenu";
import {
  formatGroupReadReceiptLabel,
  presentGroupReadReceipt,
} from "@/lib/community-messenger/group/group-room-read-presenter";
import {
  GROUP_READ_RECEIPT_MENU_MAX_MEMBERS,
  getGroupReadCountForMessage,
  setGroupReadCountsSnapshot,
  shouldShowGroupReadReceiptMenuRow,
} from "@/lib/community-messenger/group/group-read-counts-snapshot";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { MESSENGER_TEXT_SEND_TIMEOUT_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { classifyMessengerSendFailure } from "@/lib/community-messenger/upload/messenger-direct-upload-policy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/community-messenger/rooms/r1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, safeT: (k: string) => k, language: "ko" }),
}));

const t = (k: string, vars?: Record<string, string | number>) =>
  vars ? `${k}(${Object.entries(vars).map(([a, b]) => `${a}=${b}`).join(",")})` : k;

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
    t: t as never,
    ...over,
  };
}

const text = {
  id: "pending:r1:7",
  roomId: "r1",
  senderId: "u1",
  senderLabel: "me",
  messageType: "text",
  content: "안녕하세요",
  clientMessageId: "cid-7",
  createdAt: "2026-11-18T00:00:00.000Z",
  isMine: true,
};

describe("P1 상태 아이콘", () => {
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

  it("4상태 aria 와 상태 무관 고정 폭 상자", () => {
    const cases = [
      ["sending", true, "common_sending"],
      ["failed", true, "cm_ui_send_failed_label"],
      ["sent", true, "cm_ui_unread"],
      ["sent", false, "cm_ui_msg_status_sent"],
      ["read", true, "cm_ui_msg_status_read"],
    ] as const;
    for (const [status, readTracked, aria] of cases) {
      act(() => root.render(<MessengerOutboundStatusIcon status={status} readTracked={readTracked} tone="plain" t={t as never} />));
      const el = host.querySelector("[data-cm-outbound-status]") as HTMLElement;
      expect(el.getAttribute("role")).toBe("img");
      expect(el.getAttribute("aria-label")).toBe(aria);
      for (const c of MESSENGER_OUTBOUND_STATUS_ICON_BOX_CLASS.split(" ")) expect(el.className).toContain(c);
    }
  });

  it("글: 전송 중 → 저장됨 → 읽음 동안 말풍선·자리 확보 칸이 같고 옆 줄 글자가 없다", () => {
    const snaps: Array<{ bubble: string; spacer: string; status: string }> = [];
    const states: Array<[Record<string, unknown>, MessengerTimelineVirtualRowProps["outboundReadState"]]> = [
      [{ ...text, pending: true }, "none"],
      [{ ...text, id: "m-7" }, "unread"],
      [{ ...text, id: "m-7" }, "read"],
    ];
    for (const [item, rs] of states) {
      act(() => root.render(<MessengerTimelineVirtualRow {...props(item, { outboundReadState: rs })} />));
      const meta = host.querySelector("[data-cm-text-meta]") as HTMLElement;
      expect(meta).not.toBeNull();
      const spacer = host.querySelector("[data-cm-text-meta-spacer]") as HTMLElement;
      expect(spacer.getAttribute("aria-hidden")).toBe("true");
      snaps.push({
        bubble: (meta.parentElement as HTMLElement).className,
        spacer: spacer.outerHTML,
        status: meta.querySelector("[data-cm-outbound-status]")!.getAttribute("data-cm-outbound-status")!,
      });
      expect(host.textContent).not.toContain("common_sending");
      expect(host.textContent).not.toContain("cm_ui_unread");
    }
    expect(snaps.map((s) => s.status)).toEqual(["sending", "sent", "read"]);
    expect(new Set(snaps.map((s) => s.bubble)).size).toBe(1);
    expect(new Set(snaps.map((s) => s.spacer)).size).toBe(1);
  });

  it("다음 메시지로 시간이 숨겨져도 자리 확보 칸은 같다", () => {
    act(() => root.render(<MessengerTimelineVirtualRow {...props({ ...text, id: "m-7" })} />));
    const a = host.querySelector("[data-cm-text-meta-spacer]")!.outerHTML;
    act(() => root.render(<MessengerTimelineVirtualRow {...props({ ...text, id: "m-7" }, { showMessageTime: false })} />));
    expect(host.querySelector("[data-cm-text-meta-spacer]")!.outerHTML).toBe(a);
  });

  it("받은 글: 시간만 말풍선 안, 상태 아이콘 없음", () => {
    act(() =>
      root.render(<MessengerTimelineVirtualRow {...props({ ...text, id: "m-8", isMine: false }, { outboundReadState: "none" })} />)
    );
    expect(host.querySelector("[data-cm-text-meta]")).not.toBeNull();
    expect(host.querySelector("[data-cm-outbound-status]")).toBeNull();
  });

  it("실패한 글 행: 경고 아이콘 + 재전송·삭제", () => {
    act(() =>
      root.render(
        <MessengerTimelineVirtualRow {...props({ ...text, pending: true, sendFailed: true }, { outboundReadState: "none" })} />
      )
    );
    expect(host.querySelector('[data-cm-text-meta] [data-cm-outbound-status="failed"]')).not.toBeNull();
    expect(host.querySelector("[data-cm-outbound-failed]")).not.toBeNull();
  });

  it("스티커: 「전송 중」 글자 대신 스티커 위 칸 아이콘", () => {
    act(() =>
      root.render(
        <MessengerTimelineVirtualRow
          {...props({ ...text, messageType: "sticker", content: "https://x.test/s.webp", pending: true }, { outboundReadState: "none" })}
        />
      )
    );
    expect(host.textContent).not.toContain("common_sending");
    expect(host.querySelector('[data-cm-sticker-meta] [data-cm-outbound-status="sending"]')).not.toBeNull();
  });
});

describe("P1 그룹 「읽음 N명」 — 말풍선 옆에서 길게 누름 메뉴로", () => {
  it("문구는 카탈로그 키(하드코딩 한국어 없음)", () => {
    expect(formatGroupReadReceiptLabel({ readCount: 3, readerLabels: [] }, t as never)).toBe("cm_ui_group_read_count(count=3)");
    expect(formatGroupReadReceiptLabel({ readCount: 2, readerLabels: ["A", "B"] }, t as never)).toBe(
      "cm_ui_group_read_names(names=A B)"
    );
    expect(formatGroupReadReceiptLabel({ readCount: 5, readerLabels: ["A"] }, t as never)).toBe(
      "cm_ui_group_read_names_more(names=A,more=4)"
    );
    expect(formatGroupReadReceiptLabel({ readCount: 0, readerLabels: [] }, t as never)).toBe("");
    expect(presentGroupReadReceipt({ messageId: "m", readCount: 2, readerLabels: [], language: "en" }).label).toBe("Read by 2");
    const src = readFileSync(path.join(process.cwd(), "lib/community-messenger/group/group-room-read-presenter.ts"), "utf8");
    expect(src).not.toMatch(/[가-힣]+ \$\{|`읽음/);
  });

  it("100명 이하 · 내 확정 메시지 · 1명 이상 읽음일 때만", () => {
    const base = { isPrivateGroupRoom: true, memberCount: 10, isMine: true, pending: false, readCount: 1 };
    expect(shouldShowGroupReadReceiptMenuRow(base)).toBe(true);
    expect(shouldShowGroupReadReceiptMenuRow({ ...base, memberCount: GROUP_READ_RECEIPT_MENU_MAX_MEMBERS + 1 })).toBe(false);
    expect(shouldShowGroupReadReceiptMenuRow({ ...base, readCount: 0 })).toBe(false);
    expect(shouldShowGroupReadReceiptMenuRow({ ...base, isMine: false })).toBe(false);
    expect(shouldShowGroupReadReceiptMenuRow({ ...base, isPrivateGroupRoom: false })).toBe(false);
    setGroupReadCountsSnapshot("g1", { m1: { readCount: 2, readerLabels: [] } });
    expect(getGroupReadCountForMessage("g1", "m1")?.readCount).toBe(2);
  });

  it("메뉴 정보 줄로 그린다", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() =>
      root.render(
        <MessageActionMenu
          roomUnavailable={false}
          copyLabel="copy"
          copyDisabled={false}
          onCopy={() => {}}
          replyDisabled={false}
          onReply={() => {}}
          shareExpanded={false}
          shareDisabled={false}
          onToggleShare={() => {}}
          shareNested={null}
          readInfoLabel="읽음 2명"
        />
      )
    );
    expect(host.querySelector("[data-cm-group-read-info]")!.textContent).toBe("읽음 2명");
    act(() => root.unmount());
  });

  it("말풍선 행에는 그룹 라벨 prop 이 없다", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx"),
      "utf8"
    );
    expect(src).not.toContain("groupReadReceiptLabel");
  });
});

describe("P1 글·스티커 전송 시간 제한 12초 → 결과 불명 실패", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("12초 안에 응답이 없으면 abort → indeterminate(실패 행 유지 대상)", async () => {
    expect(MESSENGER_TEXT_SEND_TIMEOUT_MS).toBe(12_000);
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: unknown, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          })
      )
    );
    const p = fetchWithTimeout("/x", { timeoutMs: MESSENGER_TEXT_SEND_TIMEOUT_MS });
    const settled = p.then(
      () => "ok",
      () => "aborted"
    );
    await vi.advanceTimersByTimeAsync(MESSENGER_TEXT_SEND_TIMEOUT_MS + 10);
    expect(await settled).toBe("aborted");
    expect(classifyMessengerSendFailure({ networkError: true })).toBe("indeterminate");
    expect(classifyMessengerSendFailure({ status: 503, jsonParsed: true })).toBe("indeterminate");
    expect(classifyMessengerSendFailure({ status: 403, jsonParsed: true })).toBe("definitive");
  });

  it("컨트롤러: 글·스티커 모두 시간 제한 + 결과 불명은 실패 행 유지·같은 cid 재전송, 스티커 catch 있음", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts"),
      "utf8"
    );
    const text = src.slice(src.indexOf("const runTextSendAttempt = async"), src.indexOf("const sendRawText = useCallback("));
    expect(text).toContain("timeoutMs: MESSENGER_TEXT_SEND_TIMEOUT_MS");
    expect(text).toContain('failure === "definitive" || authBlocked');
    expect(text).toContain("markMessengerOutboundRowFailed(prev, tempId)");
    expect(text).toContain("saveMessengerFailedTextSend(streamRoomId");
    const reg = src.slice(src.indexOf("const registerFailedTextRowHandlers = ("), src.indexOf("useLayoutEffect(() => {\n    runTextSendAttemptRef.current"));
    expect(reg).toMatch(/runTextSendAttemptRef\.current\(\{\s*tempId,\s*clientMessageId,/);
    const sticker = src.slice(src.indexOf("const runStickerSendAttempt = async"), src.indexOf("const sendSticker = useCallback("));
    expect(sticker).toContain("timeoutMs: MESSENGER_TEXT_SEND_TIMEOUT_MS");
    expect(sticker).toMatch(/\} catch \{\n\s+res = null;/);
    expect(sticker).toContain("markMessengerOutboundRowFailed(prev, tempId)");
    expect(sticker).toMatch(/runStickerSendAttemptRef\.current\(\{ tempId, clientMessageId, path, stickerItemId \}\)/);
  });
});
