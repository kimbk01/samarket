import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  callEngineAcceptIncoming,
  runCallEnginePatchAction,
} from "@/lib/community-messenger/call-engine/call-engine-actions";
import { CALL_UX_DEBUG_EVENTS } from "@/lib/community-messenger/call-engine/call-engine-debug";
import { resetCallEngineLocksForTests } from "@/lib/community-messenger/call-engine/call-engine-locks";
import { resetCallEngineStateForTests } from "@/lib/community-messenger/call-engine/call-engine-state";
import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function indexBefore(source: string, needle: string, beforeNeedle: string): boolean {
  const a = source.indexOf(needle);
  const b = source.indexOf(beforeNeedle);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(-1);
  return a < b;
}

const patchCommunityMessengerCallSession = vi.fn();

vi.mock("@/lib/community-messenger/call-http-actions", () => ({
  patchCommunityMessengerCallSession: (...args: unknown[]) => patchCommunityMessengerCallSession(...args),
}));

vi.mock("@/lib/community-messenger/incoming-call-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/incoming-call-state")>();
  return {
    ...actual,
    isDibayCallConsumed: () => false,
    markCallConsumed: vi.fn(),
  };
});

vi.mock("@/lib/community-messenger/call-lifecycle", () => ({
  dibayIncomingLaneStopRing: vi.fn(),
}));

vi.mock("@/lib/push/native/dismiss-native-incoming-call-notification", () => ({
  dismissAllIncomingCallNotificationsFireAndForget: vi.fn(),
}));

describe("call-engine instant telegram UX contracts", () => {
  beforeEach(() => {
    patchCommunityMessengerCallSession.mockReset();
    vi.mocked(dibayIncomingLaneStopRing).mockReset();
    resetCallEngineLocksForTests();
    resetCallEngineStateForTests();
  });

  it("defines all required UX debug events", () => {
    const required = [
      "call_outgoing_tap",
      "call_engine_create_start",
      "call_engine_create_success",
      "call_route_enter",
      "call_media_prepare_start",
      "call_media_preview_ready",
      "call_push_dispatch_start",
      "call_incoming_surface_show",
      "call_accept_tap",
      "call_accept_patch_start",
      "call_accept_patch_success",
      "call_agora_join_start",
      "call_agora_join_success",
      "call_terminal_start",
      "call_terminal_ui_closed",
    ];
    for (const event of required) {
      expect(CALL_UX_DEBUG_EVENTS).toContain(event);
    }
  });

  it("CallClient has no raw lifecycle PATCH fetch", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(client).not.toMatch(
      /fetch\([`'"].*\/api\/community-messenger\/calls\/sessions\/[^`'"]+[`'"][\s\S]{0,500}?method:\s*["']PATCH["'][\s\S]{0,500}?action:\s*["'](?:accept|reject|cancel|end|missed)["']/
    );
    expect(client).toContain("dispatchCallEngineSignal");
  });

  it("launchOutgoingDirectCall routes before media prepare (non-blocking)", () => {
    const nav = read("lib/community-messenger/call-session-navigation-seed.ts");
    const fn = nav.slice(nav.indexOf("export async function launchOutgoingDirectCall"));
    expect(indexBefore(fn, "go(href)", "runCallMediaEducationBeforeGesture")).toBe(true);
    expect(indexBefore(fn, "go(href)", "primeOutgoingCallMediaBeforeNavigate")).toBe(true);
    expect(indexBefore(fn, "runCallMediaEducationBeforeGesture", "primeOutgoingCallMediaBeforeNavigate")).toBe(
      true
    );
    expect(indexBefore(fn, 'logCallUxEvent("call_route_enter"', 'logCallUxEvent("call_media_prepare_start"')).toBe(
      true
    );
  });

  it("blocking outgoing helpers are removed from navigation seed", () => {
    const nav = read("lib/community-messenger/call-session-navigation-seed.ts");
    expect(nav).not.toContain("export async function bootstrapCommunityMessengerOutgoingCallAndNavigate");
    expect(nav).not.toContain("export async function startOutgoingCallSessionAndOpen");
  });

  it("outgoing CTAs use launchOutgoingDirectCall only", () => {
    const ctas = [
      "components/community-messenger/CommunityMessengerHome.tsx",
      "components/community-messenger/MessengerCallLogsPanel.tsx",
      "components/chats/TradeChatCallHeaderButtons.tsx",
      "lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts",
    ];
    for (const file of ctas) {
      const src = read(file);
      expect(src).toContain("launchOutgoingDirectCall");
      expect(src).not.toContain("bootstrapCommunityMessengerOutgoingCallAndNavigate");
      expect(src).not.toContain("startOutgoingCallSessionAndOpen");
    }
  });

  it("accept controller awaits media permission before PATCH", () => {
    const controller = read("lib/community-messenger/call-engine/call-engine-controller.ts");
    const fn = controller.slice(controller.indexOf("async function handleUserAccept"));
    expect(
      indexBefore(fn, 'stopCallEngineIncomingRingtone(sid, "accept_pressed_immediate")', "await ensureCallMediaForUserGesture"),
    ).toBe(true);
    expect(indexBefore(fn, "await ensureCallMediaForUserGesture", "await callEngineAcceptIncoming")).toBe(true);
    expect(fn).not.toContain("void ensureCallMediaForUserGesture");
  });

  it("call engine accept stops ringtone before PATCH await", async () => {
    let patchStarted = false;
    patchCommunityMessengerCallSession.mockImplementation(async () => {
      patchStarted = true;
      return { ok: true, session: { id: "c-ring" } };
    });
    vi.mocked(dibayIncomingLaneStopRing).mockImplementation(() => {
      expect(patchStarted).toBe(false);
    });
    const result = await callEngineAcceptIncoming({ callId: "c-ring", source: "instant-ux-test" });
    expect(result.ok).toBe(true);
    expect(dibayIncomingLaneStopRing).toHaveBeenCalledWith("engine_accept_immediate", "c-ring");
  });

  it("terminal end closes UI before engine PATCH in call client", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    const rejectFn = client.slice(client.indexOf("const rejectIncoming = useCallback"));
    expect(indexBefore(rejectFn, "pinCommunityMessengerCallTerminalSurfaceDismiss(sid)", "callEngineActions.patch")).toBe(
      true
    );
    expect(indexBefore(rejectFn, 'dibayIncomingLaneStopRing("reject_pressed"', "callEngineActions.patch")).toBe(true);

    const endFn = client.slice(client.indexOf("const endCall = useCallback"));
    expect(indexBefore(endFn, "pinCommunityMessengerCallTerminalSurfaceDismiss(sid)", "await callEngineActions")).toBe(
      true
    );
  });

  it("end/reject/cancel use callEngineActions once", async () => {
    patchCommunityMessengerCallSession.mockResolvedValue({ ok: true, session: { id: "c-once" } });
    const first = await runCallEnginePatchAction({ callId: "c-once", action: "end", source: "instant-ux-test" });
    const second = await runCallEnginePatchAction({ callId: "c-once", action: "end", source: "instant-ux-test" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it("allows new callId after terminal consumed", async () => {
    patchCommunityMessengerCallSession.mockResolvedValue({ ok: true, session: { id: "c-old" } });
    await runCallEnginePatchAction({ callId: "c-old", action: "end", source: "instant-ux-test" });
    patchCommunityMessengerCallSession.mockResolvedValue({ ok: true, session: { id: "c-new" } });
    const next = await callEngineAcceptIncoming({ callId: "c-new", source: "instant-ux-test" });
    expect(next.ok).toBe(true);
  });

  it("foreground incoming surface is exclusive per callId", () => {
    const surface = read("lib/community-messenger/call-engine/call-engine-surface-owner.ts");
    expect(surface).toContain('"web_in_app_banner"');
    expect(surface).toContain("background_blocks_web_banner");
    expect(surface).toContain("tryLockCallEngineSurfaceOwner");
  });

  it("presentation layer does not PATCH lifecycle", () => {
    const presentation = read("lib/community-messenger/call-presentation-ownership.ts");
    expect(presentation).not.toContain("patchCommunityMessengerCallSession");
    expect(presentation).not.toContain('method: "PATCH"');
    expect(presentation).not.toContain("callEngineActions.patch");
  });
});
