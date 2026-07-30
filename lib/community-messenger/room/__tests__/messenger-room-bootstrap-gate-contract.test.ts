// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CommunityMessengerRoomBootstrapGate,
  resolveMessengerRoomEntryMountIdentity,
  shouldReusePreparedSnapshotAfterCanonicalReplace,
} from "@/components/community-messenger/room/CommunityMessengerRoomBootstrapGate";
import { canMountCommunityMessengerRoomClient } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const runtime = vi.hoisted(() => ({
  prepare: vi.fn(),
  mounts: 0,
  unmounts: 0,
  renderedSnapshotIds: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/community-messenger/room/use-messenger-room-url-search-params", () => ({
  useMessengerRoomUrlSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/community-messenger/room/peek-messenger-room-viewer-user-id-client", () => ({
  peekMessengerRoomViewerUserIdClient: () => "u1",
}));

vi.mock("@/lib/store-order-chat/infer-store-order-messenger-instant-role", () => ({
  inferInstantStoreOrderMessengerMyRole: () => "member",
}));

vi.mock("@/lib/store-order-chat/store-order-messenger-room-entry-client", () => ({
  prepareStoreOrderMessengerRoomEntryByRoomId: runtime.prepare,
}));

vi.mock("@/lib/auth/resource-access-denied-flow", () => ({
  redirectResourceAccessDenied: vi.fn(),
}));

vi.mock("@/components/community-messenger/CommunityMessengerRoomClient", () => ({
  CommunityMessengerRoomClient: ({
    initialServerSnapshot,
  }: {
    initialServerSnapshot: { room: { id: string } };
  }) => {
    runtime.renderedSnapshotIds.push(initialServerSnapshot.room.id);
    useEffect(() => {
      runtime.mounts += 1;
      return () => {
        runtime.unmounts += 1;
      };
    }, []);
    return createElement("div", {
      "data-testid": "room-client",
      "data-room-id": initialServerSnapshot.room.id,
    });
  },
}));

vi.mock("@/components/community-messenger/room/CommunityMessengerRoomEntryEmpty", () => ({
  CommunityMessengerRoomEntryEmpty: () =>
    createElement("div", { "data-testid": "room-entry-empty" }),
}));

const emptyDirectRoomShell = {
  roomType: "direct" as const,
  roomStatus: "active" as const,
  visibility: "private" as const,
  joinPolicy: "invite_only" as const,
  identityPolicy: "alias_allowed" as const,
  isReadonly: false,
  title: "",
  subtitle: "",
  summary: "",
  avatarUrl: null,
  unreadCount: 0,
  lastMessageAt: new Date().toISOString(),
  memberCount: 0,
  ownerUserId: null,
  ownerLabel: "",
  memberLimit: null,
  isDiscoverable: false,
  requiresPassword: false,
  allowMemberInvite: false,
};

describe("CommunityMessengerRoomBootstrapGate mount contract", () => {
  beforeEach(() => {
    runtime.prepare.mockReset();
    runtime.mounts = 0;
    runtime.unmounts = 0;
    runtime.renderedSnapshotIds = [];
  });

  it("alias → canonical replace는 동일 mount identity를 유지한다", () => {
    const convergence = {
      requestedRoomId: "trade-alias-42",
      canonicalRoomId: "canonical-room-42",
    };

    const aliasMountIdentity = resolveMessengerRoomEntryMountIdentity({
      routeRoomId: "trade-alias-42",
      snapshotRoomId: "canonical-room-42",
      convergence,
    });
    const canonicalMountIdentity = resolveMessengerRoomEntryMountIdentity({
      routeRoomId: "canonical-room-42",
      snapshotRoomId: "canonical-room-42",
      convergence: null,
    });

    expect(aliasMountIdentity).toBe("canonical-room-42");
    expect(canonicalMountIdentity).toBe(aliasMountIdentity);
  });

  it("alias → canonical replace는 준비된 snapshot을 재사용해 bootstrap 1회를 유지한다", () => {
    expect(
      shouldReusePreparedSnapshotAfterCanonicalReplace({
        routeRoomId: "canonical-room-42",
        snapshotRoomId: "canonical-room-42",
        convergence: {
          requestedRoomId: "trade-alias-42",
          canonicalRoomId: "canonical-room-42",
        },
      })
    ).toBe(true);
  });

  it("다른 실제 방은 alias convergence로 합치지 않는다", () => {
    const convergence = {
      requestedRoomId: "trade-alias-42",
      canonicalRoomId: "canonical-room-42",
    };

    expect(
      resolveMessengerRoomEntryMountIdentity({
        routeRoomId: "different-room-99",
        snapshotRoomId: "canonical-room-42",
        convergence,
      })
    ).toBeNull();
    expect(
      shouldReusePreparedSnapshotAfterCanonicalReplace({
        routeRoomId: "different-room-99",
        snapshotRoomId: "canonical-room-42",
        convergence,
      })
    ).toBe(false);
  });

  it("alias → canonical runtime 3회에서 mount 1·bootstrap 1·이전 방 노출 0", async () => {
    const aliasRoomId = "trade-alias-42";
    const canonicalRoomId = "canonical-room-42";
    const snapshot = {
      viewerUserId: "u1",
      myRole: "member" as const,
      room: {
        id: canonicalRoomId,
        ...emptyDirectRoomShell,
        memberCount: 2,
        lastMessage: "",
      },
      members: [],
      messages: [],
      readReceipt: null,
      activeCall: null,
    };
    const rows: Array<{
      run: number;
      mounts: number;
      bootstrapCalls: number;
      previousRoomExposure: number;
    }> = [];

    for (let run = 1; run <= 3; run += 1) {
      runtime.prepare.mockResolvedValueOnce({
        ok: true,
        roomId: canonicalRoomId,
        snapshot,
      });
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(CommunityMessengerRoomBootstrapGate, {
            roomId: aliasRoomId,
            initialViewerUserId: "u1",
          })
        );
      });
      await vi.waitFor(() => {
        expect(container.querySelector('[data-testid="room-client"]')).not.toBeNull();
      });
      await act(async () => {
        root.render(
          createElement(CommunityMessengerRoomBootstrapGate, {
            roomId: canonicalRoomId,
            initialViewerUserId: "u1",
          })
        );
      });

      const runMounts = runtime.mounts - rows.reduce((sum, row) => sum + row.mounts, 0);
      const runBootstrapCalls =
        runtime.prepare.mock.calls.length -
        rows.reduce((sum, row) => sum + row.bootstrapCalls, 0);
      const previousRoomExposure = runtime.renderedSnapshotIds.filter(
        (roomId) => roomId !== canonicalRoomId
      ).length;
      rows.push({
        run,
        mounts: runMounts,
        bootstrapCalls: runBootstrapCalls,
        previousRoomExposure,
      });

      await act(async () => {
        root.unmount();
      });
      container.remove();
      runtime.renderedSnapshotIds = [];
    }

    expect(rows).toEqual([
      { run: 1, mounts: 1, bootstrapCalls: 1, previousRoomExposure: 0 },
      { run: 2, mounts: 1, bootstrapCalls: 1, previousRoomExposure: 0 },
      { run: 3, mounts: 1, bootstrapCalls: 1, previousRoomExposure: 0 },
    ]);
  });

  it("bootstrap complete 전 RoomClient 미마운트 — incomplete seed", () => {
    expect(
      canMountCommunityMessengerRoomClient({
        viewerUserId: "u1",
        myRole: "member",
        room: {
          id: "r1",
          ...emptyDirectRoomShell,
          memberCount: 2,
          lastMessage: "hint only",
        },
        members: [],
        messages: [],
        readReceipt: null,
        activeCall: null,
      })
    ).toBe(false);
  });

  it("진짜 빈 방은 mount 허용", () => {
    expect(
      canMountCommunityMessengerRoomClient({
        viewerUserId: "u1",
        myRole: "member",
        room: {
          id: "r-empty",
          ...emptyDirectRoomShell,
          lastMessage: "",
        },
        members: [],
        messages: [],
        readReceipt: null,
        activeCall: null,
      })
    ).toBe(true);
  });

  it("목록 placeholder lastMessage + 빈 messages[] — 신규 1:1 mount 허용", () => {
    expect(
      canMountCommunityMessengerRoomClient({
        viewerUserId: "u1",
        myRole: "member",
        room: {
          id: "r-new-direct",
          ...emptyDirectRoomShell,
          lastMessage: "메시지를 보내 보세요.",
        },
        members: [],
        messages: [],
        readReceipt: null,
        activeCall: null,
      })
    ).toBe(true);
  });
});
