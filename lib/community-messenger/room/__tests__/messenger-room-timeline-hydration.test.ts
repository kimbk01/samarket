import { describe, expect, it } from "vitest";
import {
  hasMessengerRoomTimelineLoadHint,
  hasMessengerRoomHydrationTimelineSeed,
  isMessengerRoomLastMessageOnlyPaintHint,
  isMessengerRoomTimelineBootstrapSeedComplete,
  isMessengerRoomTimelinePaintableBootstrapSeed,
  resolveMessengerRoomPhase2HydrationPassInitial,
  shouldShowMessengerRoomTimelineEmptyState,
  shouldShowMessengerRoomTimelineHydrationSkeleton,
} from "@/lib/community-messenger/room/messenger-room-timeline-hydration";

describe("messenger-room-timeline-hydration", () => {
  it("hasMessengerRoomTimelineLoadHint — 빈 신규 방은 false", () => {
    expect(
      hasMessengerRoomTimelineLoadHint({
        roomMessagesLength: 0,
        snapshotMessagesLength: 0,
        lastMessage: "",
      })
    ).toBe(false);
  });

  it("hasMessengerRoomTimelineLoadHint — lastMessage 힌트만 있어도 true", () => {
    expect(
      hasMessengerRoomTimelineLoadHint({
        roomMessagesLength: 0,
        snapshotMessagesLength: 0,
        lastMessage: "안녕",
      })
    ).toBe(true);
  });

  it("placeholder 빈 방 — 버퍼링 스피너 없음", () => {
    expect(
      shouldShowMessengerRoomTimelineHydrationSkeleton({
        displayRoomMessagesLength: 0,
        roomMessagesLength: 0,
        hydrationPass: 0,
        clientShellPlaceholder: true,
        loading: true,
        snapshotMessagesLength: 0,
        lastMessage: "",
        timelineInitialLoadComplete: false,
      })
    ).toBe(false);
  });

  it("placeholder + lastMessage 힌트 — 로딩 중 스피너", () => {
    expect(
      shouldShowMessengerRoomTimelineHydrationSkeleton({
        displayRoomMessagesLength: 0,
        roomMessagesLength: 0,
        hydrationPass: 0,
        clientShellPlaceholder: true,
        loading: true,
        snapshotMessagesLength: 0,
        lastMessage: "마지막 메시지",
        timelineInitialLoadComplete: false,
      })
    ).toBe(true);
  });

  it("lastMessage-only + initial load 미완 — pass2여도 skeleton", () => {
    expect(
      shouldShowMessengerRoomTimelineHydrationSkeleton({
        displayRoomMessagesLength: 0,
        roomMessagesLength: 0,
        hydrationPass: 2,
        clientShellPlaceholder: false,
        loading: false,
        snapshotMessagesLength: 0,
        lastMessage: "hint",
        timelineInitialLoadComplete: false,
      })
    ).toBe(true);
  });

  it("isMessengerRoomLastMessageOnlyPaintHint — messages[] 없으면 true", () => {
    expect(
      isMessengerRoomLastMessageOnlyPaintHint({
        roomMessagesLength: 0,
        snapshotMessagesLength: 0,
        lastMessage: "hi",
      })
    ).toBe(true);
    expect(
      isMessengerRoomLastMessageOnlyPaintHint({
        roomMessagesLength: 0,
        snapshotMessagesLength: 1,
        lastMessage: "hi",
      })
    ).toBe(false);
  });

  it("empty state — initial load complete 이후에만", () => {
    expect(
      shouldShowMessengerRoomTimelineEmptyState({
        paintMessageCount: 0,
        timelineInitialLoadComplete: false,
        timelineLoadFailed: false,
      })
    ).toBe(false);
    expect(
      shouldShowMessengerRoomTimelineEmptyState({
        paintMessageCount: 0,
        timelineInitialLoadComplete: true,
        timelineLoadFailed: false,
      })
    ).toBe(true);
  });

  it("실스냅샷 빈 방 — 로딩 없으면 스피너 없음", () => {
    expect(
      shouldShowMessengerRoomTimelineHydrationSkeleton({
        displayRoomMessagesLength: 0,
        roomMessagesLength: 0,
        hydrationPass: 2,
        clientShellPlaceholder: false,
        loading: false,
        snapshotMessagesLength: 0,
        lastMessage: "",
        timelineInitialLoadComplete: true,
      })
    ).toBe(false);
  });

  it("isMessengerRoomTimelineBootstrapSeedComplete — 신규 빈 방", () => {
    expect(
      isMessengerRoomTimelineBootstrapSeedComplete({
        messages: [],
        room: { lastMessage: "" },
      })
    ).toBe(true);
  });

  it("isMessengerRoomTimelineBootstrapSeedComplete — lastMessage 힌트만 있으면 불완전", () => {
    expect(
      isMessengerRoomTimelineBootstrapSeedComplete({
        messages: [],
        room: { lastMessage: "안녕" },
      })
    ).toBe(false);
  });

  it("isMessengerRoomTimelineBootstrapSeedComplete — lastMessage 와 messages 모두 있으면 완전", () => {
    expect(
      isMessengerRoomTimelineBootstrapSeedComplete({
        messages: [{ id: "m1" } as never],
        room: { lastMessage: "안녕" },
      })
    ).toBe(true);
  });

  it("isMessengerRoomTimelinePaintableBootstrapSeed — lastMessage only → false", () => {
    expect(
      isMessengerRoomTimelinePaintableBootstrapSeed({
        messages: [],
        room: { lastMessage: "통화" },
      })
    ).toBe(false);
  });

  it("isMessengerRoomTimelinePaintableBootstrapSeed — messages[] complete → true", () => {
    expect(
      isMessengerRoomTimelinePaintableBootstrapSeed({
        messages: [{ id: "m1" } as never],
        room: { lastMessage: "통화" },
      })
    ).toBe(true);
  });

  it("hasMessengerRoomHydrationTimelineSeed — lastMessage only → false", () => {
    expect(
      hasMessengerRoomHydrationTimelineSeed({
        roomMessagesLength: 0,
        snapshotMessagesLength: 0,
        snapshot: { messages: [], room: { lastMessage: "stub" } },
      })
    ).toBe(false);
  });

  it("hasMessengerRoomHydrationTimelineSeed — paintable messages[] → true", () => {
    expect(
      hasMessengerRoomHydrationTimelineSeed({
        roomMessagesLength: 0,
        snapshotMessagesLength: 2,
        snapshot: {
          messages: [{ id: "a" } as never, { id: "b" } as never],
          room: { lastMessage: "b" },
        },
      })
    ).toBe(true);
  });

  it("resolveMessengerRoomPhase2HydrationPassInitial — seed → pass3 (no pass2 idle expand)", () => {
    expect(
      resolveMessengerRoomPhase2HydrationPassInitial({ persistedPass: 1, hasTimelineSeed: true })
    ).toBe(3);
    expect(
      resolveMessengerRoomPhase2HydrationPassInitial({ persistedPass: 2, hasTimelineSeed: true })
    ).toBe(3);
    expect(
      resolveMessengerRoomPhase2HydrationPassInitial({ persistedPass: 1, hasTimelineSeed: false })
    ).toBe(1);
  });
});
