import { describe, expect, it, vi } from "vitest";
import {
  dispatchCallEngineNativeEvent,
  subscribeCallEngineNativeEvent,
} from "@/lib/community-messenger/call-engine/call-engine-native-bridge";

describe("call-engine native bridge", () => {
  it("dispatches and subscribes native action events", () => {
    const target = new EventTarget();
    const prevAdd = (globalThis as any).addEventListener;
    const prevRemove = (globalThis as any).removeEventListener;
    const prevDispatch = (globalThis as any).dispatchEvent;
    (globalThis as any).addEventListener = target.addEventListener.bind(target);
    (globalThis as any).removeEventListener = target.removeEventListener.bind(target);
    (globalThis as any).dispatchEvent = target.dispatchEvent.bind(target);

    const listener = vi.fn();
    const unsubscribe = subscribeCallEngineNativeEvent(listener);
    dispatchCallEngineNativeEvent({
      callId: "c1",
      action: "accept",
      source: "native_notification",
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();

    (globalThis as any).addEventListener = prevAdd;
    (globalThis as any).removeEventListener = prevRemove;
    (globalThis as any).dispatchEvent = prevDispatch;
  });
});
