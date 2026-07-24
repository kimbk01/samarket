// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Boot/IO Authority contract ④: the integrated chat-room-list Realtime hook must report
 * healthy only when EVERY subscribed channel is SUBSCRIBED, and report unhealthy when any
 * channel drops — so the list poll can stand down while healthy and resume as fallback.
 */

type StatusCb = (status: string) => void;
const statusCallbacks = new Map<string, StatusCb>();

function makeChannel(name: string) {
  const ch: Record<string, unknown> = { __name: name };
  ch.on = () => ch;
  ch.subscribe = (cb?: StatusCb) => {
    if (cb) statusCallbacks.set(name, cb);
    return ch;
  };
  return ch;
}

const fakeSb = {
  channel: (name: string) => makeChannel(name),
  removeChannel: () => {},
};

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => fakeSb,
}));
vi.mock("@/lib/supabase/wait-for-realtime-auth", () => ({
  waitForSupabaseRealtimeAuth: async () => true,
}));

import { useIntegratedChatRoomListRealtime } from "@/lib/chats/use-integrated-chat-room-list-realtime";

let container: HTMLDivElement;
let root: Root;

function Harness(props: { onHealthChange: (h: boolean) => void }) {
  useIntegratedChatRoomListRealtime({
    userId: "user-1",
    integratedRoomIds: ["room-a"],
    enabled: true,
    onListStale: () => {},
    onHealthChange: props.onHealthChange,
  });
  return null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useIntegratedChatRoomListRealtime health (contract ④)", () => {
  beforeEach(() => {
    statusCallbacks.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("reports healthy only after all channels are SUBSCRIBED, unhealthy on drop", async () => {
    const onHealthChange = vi.fn();
    await act(async () => {
      root.render(createElement(Harness, { onHealthChange }));
    });
    await flush();

    // participants + msgs + rooms = 3 channels for one room chunk
    const names = [...statusCallbacks.keys()];
    expect(names.length).toBe(3);

    // Only some SUBSCRIBED → not healthy yet
    act(() => statusCallbacks.get(names[0])!("SUBSCRIBED"));
    act(() => statusCallbacks.get(names[1])!("SUBSCRIBED"));
    expect(onHealthChange).not.toHaveBeenCalledWith(true);

    // All SUBSCRIBED → healthy true (poll stands down)
    act(() => statusCallbacks.get(names[2])!("SUBSCRIBED"));
    expect(onHealthChange).toHaveBeenLastCalledWith(true);

    // One drops → healthy false (poll resumes as fallback)
    act(() => statusCallbacks.get(names[1])!("CHANNEL_ERROR"));
    expect(onHealthChange).toHaveBeenLastCalledWith(false);

    // Recovers → healthy true again
    act(() => statusCallbacks.get(names[1])!("SUBSCRIBED"));
    expect(onHealthChange).toHaveBeenLastCalledWith(true);
  });
});
