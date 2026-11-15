// @vitest-environment jsdom
/**
 * 음성 메시지 결함 (2026-11-16 실기 측정 · docs/audit/messenger-remaining-defects-root-cause-2026-11-16.md)
 * V1 녹음 중 시간 0:00.0000 고정 — 입력창 VM 이 타임라인용 `view`(필드 고정 의존)를 거쳐 녹음 값이 멈춤
 * V2 내 말풍선 재생 막대가 말풍선 색(진한 초록)으로 칠해짐
 * V3 시간·「안 읽음」이 말풍선 옆에 있어 줄 폭이 줄고 파형이 말풍선 밖으로 넘침
 * V4 메뉴를 열려고 파형을 길게 누르면 재생 위치가 옮겨짐
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VoiceMessageBubble,
  VOICE_WAVEFORM_TAP_MAX_MS,
} from "@/components/community-messenger/VoiceMessageBubble";
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
  useI18n: () => ({ t: (k: string) => k, safeT: (k: string) => k, language: "ko" }),
}));

describe("V1 입력창 VM 은 최신 room 에서 녹음 값을 읽는다", () => {
  const src = readFileSync(
    path.join(process.cwd(), "components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx"),
    "utf8"
  );
  const start = src.indexOf("const composerView = useMemo");
  const end = src.indexOf("const callView = useMemo", start);
  const block = src.slice(start, end);

  it("녹음 값 6개를 room 에서 읽고 의존 목록에도 room 값으로 넣는다", () => {
    expect(start).toBeGreaterThan(0);
    for (const key of [
      "voiceRecordElapsedMs",
      "voiceLivePreviewBars",
      "voiceCancelHint",
      "voiceLockHint",
      "voiceHandsFree",
      "voiceMicArming",
    ]) {
      expect(block).toContain(`${key}: room.${key}`);
      expect(block).toContain(`      room.${key},`);
    }
    expect(block).not.toMatch(/\bview\./);
  });
});

describe("음성 말풍선", () => {
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
    vi.useRealTimers();
  });

  function render(isMine = true, meta?: string) {
    act(() =>
      root.render(
        <VoiceMessageBubble
          src="https://x.test/a.m4a"
          durationSeconds={2}
          isMine={isMine}
          waveformPeaks={Array.from({ length: 48 }, () => 0.5)}
          sentTimeLabel={meta}
        />
      )
    );
    const audio = host.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "duration", { configurable: true, value: 10 });
    const wave = host.querySelector('[role="slider"]') as HTMLDivElement;
    wave.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 32, right: 100, bottom: 32, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    return { audio, wave };
  }

  function pointer(target: EventTarget, type: string, x: number) {
    const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10, button: 0 });
    Object.defineProperty(ev, "pointerId", { value: 1 });
    act(() => {
      target.dispatchEvent(ev);
    });
  }

  it("V2 내 말풍선: 재생 막대는 흰색, 안 한 막대는 반투명 흰색 (말풍선 초록 금지)", () => {
    render(true);
    const html = host.innerHTML;
    expect(html).not.toContain("--cm-room-primary");
    const bars = [...host.querySelectorAll('[role="slider"] > *')];
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every((b) => /bg-sam-surface/.test(b.className))).toBe(true);
  });

  it("V3 폭은 220px 고정(옆 표시와 무관), 시간·읽음은 말풍선 안에", () => {
    render(true, "cm_ui_unread 4:18 AM");
    const box = host.querySelector("[data-cm-voice-bubble]") as HTMLElement;
    expect(box.className).toContain("w-[220px]");
    expect(box.className).toContain("max-w-full");
    expect(host.querySelector("[data-cm-voice-meta]")!.textContent).toBe("cm_ui_unread 4:18 AM");
  });

  it("V4 짧게 탭하면 그 위치로 이동", () => {
    const { audio, wave } = render(true);
    pointer(wave, "pointerdown", 50);
    pointer(window, "pointerup", 50);
    expect(audio.currentTime).toBe(5);
    expect(wave.getAttribute("aria-valuenow")).toBe("50");
  });

  it("V4 길게 누르면(메뉴) 재생 위치를 옮기지 않음", () => {
    vi.useFakeTimers();
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    const { audio, wave } = render(true);
    pointer(wave, "pointerdown", 70);
    now.mockReturnValue(1000 + VOICE_WAVEFORM_TAP_MAX_MS + 200);
    pointer(window, "pointerup", 70);
    expect(audio.currentTime).toBe(0);
    expect(wave.getAttribute("aria-valuenow")).toBe("0");
    now.mockRestore();
  });

  it("V4 끌면(스크롤 등) 이동하지 않음", () => {
    const { audio, wave } = render(true);
    pointer(wave, "pointerdown", 20);
    pointer(window, "pointerup", 60);
    expect(audio.currentTime).toBe(0);
  });
});

function rowProps(item: Record<string, unknown>, over: Partial<MessengerTimelineVirtualRowProps> = {}): MessengerTimelineVirtualRowProps {
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
    mineUnreadBadgeVisible: true,
    timelineHighlightMessageId: null,
    messageActionItemId: null,
    mediaAutoSaveEnabled: false,
    sendingLabel: "sending",
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
    ...over,
  };
}

describe("V3 음성 줄: 시간·읽음은 말풍선 안, 옆 줄에는 없음", () => {
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

  const voice = {
    id: "755455f0-fc2c-49f4-b1e1-109d3fa0c9cc",
    roomId: "r1",
    senderId: "u1",
    senderLabel: "me",
    messageType: "voice",
    content: "https://x.test/a.m4a",
    voiceDurationSeconds: 2,
    createdAt: "2026-11-16T00:00:00.000Z",
    isMine: true,
  };

  /** 음성 말풍선은 lazy 청크 — 실제로 그려질 때까지 기다린다(빈 화면으로 통과 금지). */
  async function renderRow(over: Partial<MessengerTimelineVirtualRowProps> = {}) {
    act(() => root.render(<MessengerTimelineVirtualRow {...rowProps(voice, over)} />));
    for (let i = 0; i < 50 && !host.querySelector("[data-cm-voice-bubble]"); i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    }
    expect(host.querySelector("[data-cm-voice-bubble]")).not.toBeNull();
  }

  it("내 음성: 「안 읽음」·시간이 말풍선 안 표시에만 있다", async () => {
    await renderRow();
    const meta = host.querySelector("[data-cm-voice-meta]") as HTMLElement;
    expect(meta.textContent).toContain("cm_ui_unread");
    const outside = [...host.querySelectorAll("span")].filter(
      (s) => !s.closest("[data-cm-voice-bubble]") && /cm_ui_unread/.test(s.textContent ?? "")
    );
    expect(outside).toHaveLength(0);
  });

  it("읽음이 바뀌어도 말풍선 폭 지정은 같고, 안 읽음 글자만 빠진다", async () => {
    await renderRow({ mineUnreadBadgeVisible: true });
    const c1 = (host.querySelector("[data-cm-voice-bubble]") as HTMLElement).className;
    await renderRow({ mineUnreadBadgeVisible: false });
    const c2 = (host.querySelector("[data-cm-voice-bubble]") as HTMLElement).className;
    expect(c1).toBe(c2);
    expect(host.querySelector("[data-cm-voice-meta]")!.textContent).not.toContain("cm_ui_unread");
  });
});
