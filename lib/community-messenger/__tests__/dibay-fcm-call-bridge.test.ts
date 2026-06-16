import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { installDibayFcmCallBridge } from "@/lib/community-messenger/dibay-fcm-call-bridge";

describe("dibay-fcm-call-bridge terminal routing", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes caller avatar through FCM wake bridge", () => {
    const onIncomingWake = vi.fn();
    const listeners = new Map<string, (ev: Event) => void>();
    vi.stubGlobal("window", {
      addEventListener: (type: string, fn: (ev: Event) => void) => {
        listeners.set(type, fn);
      },
      removeEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis);

    installDibayFcmCallBridge({
      onIncomingWake,
      onFcmTerminal: vi.fn(),
    });

    const onCallEvent = listeners.get("dibay:call-event");
    onCallEvent?.(
      new CustomEvent("dibay:call-event", {
        detail: {
          type: "incoming_call",
          sessionId: "call-avatar-1",
          callKind: "voice",
          roomId: "room-1",
          callerId: "caller-1",
          callerName: "Caller",
          callerAvatarUrl: "https://example.com/a.jpg",
        },
      })
    );

    expect(onIncomingWake).toHaveBeenCalledWith({
      sessionId: "call-avatar-1",
      callKind: "voice",
      roomId: "room-1",
      callerId: "caller-1",
      callerName: "Caller",
      callerAvatarUrl: "https://example.com/a.jpg",
    });
  });

  it("routes call_terminal and call_canceled through onFcmTerminal", () => {
    const onFcmTerminal = vi.fn();
    const listeners = new Map<string, (ev: Event) => void>();
    vi.stubGlobal("window", {
      addEventListener: (type: string, fn: (ev: Event) => void) => {
        listeners.set(type, fn);
      },
      removeEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis);

    installDibayFcmCallBridge({
      onIncomingWake: vi.fn(),
      onFcmTerminal,
    });

    const onCallEvent = listeners.get("dibay:call-event");
    expect(onCallEvent).toBeTypeOf("function");

    onCallEvent?.(
      new CustomEvent("dibay:call-event", {
        detail: { type: "call_canceled", sessionId: "fc-bridge-cancel-1" },
      })
    );
    expect(onFcmTerminal).toHaveBeenCalledWith({
      callId: "fc-bridge-cancel-1",
      terminalKind: "cancelled",
      fcmType: "call_canceled",
      bridgeSource: "call_canceled",
    });

    onCallEvent?.(
      new CustomEvent("dibay:call-event", {
        detail: { type: "call_terminal", sessionId: "fc-bridge-term-1", status: "ended" },
      })
    );
    expect(onFcmTerminal).toHaveBeenLastCalledWith({
      callId: "fc-bridge-term-1",
      terminalKind: "ended",
      fcmType: "call_terminal",
      bridgeSource: "call_terminal",
    });
  });
});
