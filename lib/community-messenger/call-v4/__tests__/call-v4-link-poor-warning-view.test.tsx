import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-v4/call-v4-native-accept-flight", () => ({
  isNativeAcceptInflight: vi.fn(() => false),
}));

import { buildCallV4ScreenViewModel } from "@/lib/community-messenger/call-v4/call-v4-view-model";
import type { CallV4Identity } from "@/lib/community-messenger/call-v4/call-v4-types";
import type { CallV4MediaSnapshot } from "@/lib/community-messenger/call-v4/call-v4-media-state";
import { CallLinkPoorWarningOverlay } from "@/components/messenger/call/CallLinkPoorWarningOverlay";

const identity: CallV4Identity = {
  callId: "call-vm",
  roomId: "room-1",
  callerUserId: "caller",
  calleeUserId: "callee",
  direction: "outgoing",
  mediaType: "video",
  createdAt: new Date().toISOString(),
  peerLabel: "Peer",
  peerAvatarUrl: null,
};

const safeT = (key: string, options?: { fallbackKo?: string; fallbackEn?: string }) =>
  options?.fallbackKo ?? options?.fallbackEn ?? key;

const media = (linkPoorWarning: boolean): CallV4MediaSnapshot => ({
  micEnabled: true,
  speakerEnabled: true,
  cameraEnabled: true,
  localVideoMinimized: false,
  localVideoReady: true,
  remoteVideoReady: true,
  incomingVideoUpgradeRequest: false,
  pendingVideoUpgradeRequest: false,
  connectionSignalTier: "poor",
  linkPoorWarning,
});

const router = { replace: vi.fn(), push: vi.fn() };

describe("V-8 — 웹 통화 화면 연결 경고", () => {
  it("connected + 히스테리시스 경고 → 「연결 상태가 좋지 않습니다」·경고 플래그", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const vm = buildCallV4ScreenViewModel({
      callId: "call-vm",
      phase: "connected",
      identity,
      connectedAt: Date.now(),
      safeT,
      router,
      mediaState: media(true),
    });
    expect(vm?.linkPoorWarning).toBe(true);
    expect(vm?.linkPoorWarningText).toBe("연결 상태가 좋지 않습니다");
    expect(vm?.connectionLabel).toBe("연결 상태가 좋지 않습니다");
  });

  it("경고가 아니거나 연결 전이면 표시하지 않는다", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const off = buildCallV4ScreenViewModel({
      callId: "call-vm",
      phase: "connected",
      identity,
      connectedAt: Date.now(),
      safeT,
      router,
      mediaState: media(false),
    });
    expect(off?.linkPoorWarning).toBeUndefined();
    const ringing = buildCallV4ScreenViewModel({
      callId: "call-vm",
      phase: "outgoing_ringing",
      identity,
      connectedAt: null,
      safeT,
      router,
      mediaState: media(true),
    });
    expect(ringing?.linkPoorWarning).toBeUndefined();
  });

  it("테두리 오버레이는 터치를 막지 않는다(pointer-events:none)", () => {
    const html = renderToStaticMarkup(<CallLinkPoorWarningOverlay text="연결 상태가 좋지 않습니다" />);
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("pointer-events:none");
    expect(html).toContain("연결 상태가 좋지 않습니다");
    expect(html).toContain('data-testid="call-link-poor-warning"');
  });
});
