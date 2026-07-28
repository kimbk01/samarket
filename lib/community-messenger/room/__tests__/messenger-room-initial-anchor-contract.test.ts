import { describe, expect, it } from "vitest";
import { createChatThreadScrollEngine } from "@/lib/chat-thread-scroll/engine";
import { resolveMessengerRoomEntryScrollPlan } from "@/lib/community-messenger/room/messenger-room-entry-intent";
import { resolveMessengerRoomEntryScrollPaintReady } from "@/lib/community-messenger/room/messenger-room-entry-scroll-ready";
import {
  summarizeCmScrollAuthorityBag,
  type CmScrollAuthorityEvent,
} from "@/lib/community-messenger/room/cm-room-scroll-authority-instrumentation";

/**
 * Proves the legacy paint-then-correct failure mode and the new single-initial contract.
 */
describe("chat room initial anchor contract (legacy-class)", () => {
  it("composer height must not block paint-ready (no paint-then-correct gate)", () => {
    const vp = {
      clientHeight: 400,
      querySelectorAll: () => [{}, {}],
    } as unknown as HTMLElement;
    expect(
      resolveMessengerRoomEntryScrollPaintReady({
        viewport: vp,
        messageCount: 2,
        composerHeightSynced: true,
      })
    ).toBe(true);
    expect(
      resolveMessengerRoomEntryScrollPaintReady({
        viewport: vp,
        messageCount: 2,
        composerHeightSynced: false,
      })
    ).toBe(true);
  });

  it("entry plan: unread+lastRead restores; push forces latest; default latest", () => {
    expect(
      resolveMessengerRoomEntryScrollPlan({
        intent: "default",
        hasPersisted: false,
        unreadCount: 3,
        lastReadMessageId: "m-read",
      })
    ).toEqual({
      reason: "room_entry_restore",
      clearPersist: true,
      forceBottom: false,
      anchorMessageId: "m-read",
    });
    expect(
      resolveMessengerRoomEntryScrollPlan({ intent: "push", hasPersisted: true }).forceBottom
    ).toBe(true);
    expect(
      resolveMessengerRoomEntryScrollPlan({
        intent: "default",
        hasPersisted: false,
        unreadCount: 0,
      }).reason
    ).toBe("initial_load");
  });

  it("engine: initial bottom once — layout resize after settle does not re-enter", () => {
    let scrollTop = 0;
    const vp = {
      clientHeight: 400,
      get scrollHeight() {
        return 1200;
      },
      get scrollTop() {
        return scrollTop;
      },
      set scrollTop(v: number) {
        scrollTop = v;
      },
      querySelectorAll: () => [{}, {}, {}],
    } as unknown as HTMLElement;
    const ctx = { viewport: vp, messageCount: 3, virtualizer: null };
    const engine = createChatThreadScrollEngine();

    engine.notifyEntry({ forceBottom: true });
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    expect(engine.tryCompleteEntry(ctx)).toBe(true);
    expect(engine.getPhase()).toBe("settled");
    expect(scrollTop).toBe(1200);

    /** second "entry" attempt must be no-op once settled */
    expect(engine.tryCompleteEntry(ctx)).toBe(false);

    scrollTop = 900;
    engine.syncStickFromViewport(ctx);
    engine.notifyLayoutResize(ctx);
    expect(engine.getPhase()).toBe("settled");
  });

  it("authority bag: fingerprint/tail_settle sources count as legacy FAIL", () => {
    const bag = {
      roomId: "r1",
      roomGeneration: 1,
      events: [] as CmScrollAuthorityEvent[],
      scrollCommandCount: 0,
      initialAnchorCount: 0,
      sources: ["initial_latest", "legacy_tail_settle", "entry_tail_settle"],
    };
    bag.scrollCommandCount = 3;
    bag.initialAnchorCount = 1;
    const summary = summarizeCmScrollAuthorityBag(bag);
    expect(summary.initialAnchorCount).toBe(1);
    expect(summary.legacySettleCount).toBe(2);
  });
});
