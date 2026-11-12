// @vitest-environment jsdom
/**
 * 그룹 채팅 결함 D2·D3 (docs/design/group-chat-audit-design-2026-11-13.md · PR F).
 * D2 운영 실측 2026-11-13: 그룹 사진을 바꿔도 홈 목록 행이 기본 아이콘 그대로(Xiaomi 4분·Samsung 47초 뒤),
 *    서버 응답 4종 모두 사진 있음 — 행 재사용 비교·목록 캐시 키·홈 지문에 사진이 없어 옛 행을 재사용.
 * D3 운영 실측: 다른 멤버가 방에 들어갈 때 머리글이 옛 사진 — 캐시로 그린 진입은 방 정보를 다시 받지 않음.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fingerprintHomeSyncLists } from "@/lib/community-messenger/home/home-sync-list-fingerprint";
import {
  communityMessengerRoomsSortCacheKey,
  unifiedListItemRowDisplayEqual,
  visibleChatListInputKey,
  type UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import {
  CM_ROOM_ENTRY_GROUP_IDENTITY_CHECK_DELAY_MS,
  useMessengerRoomBootstrapLifecycle,
  type MessengerRoomBootstrapRefreshFn,
} from "@/lib/community-messenger/room/use-messenger-room-bootstrap-lifecycle";
import {
  hasCmRoomNetworkBootstrapSucceededSince,
  markCmRoomSilentBootstrapSuccess,
  touchCmRoomForegroundLockFromSnapshot,
} from "@/lib/community-messenger/room/cm-room-bootstrap-lock";
import type { CommunityMessengerRoomSnapshot, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const group = {
  id: "72a97f0f-65d9-4162-bae1-de33f0c30090",
  roomType: "private_group",
  roomStatus: "active",
  title: "B2B TEST",
  avatarUrl: null,
  subtitle: "",
  summary: "",
  lastMessageAt: "2026-11-13T06:30:00.000Z",
  lastMessage: "hi",
  lastMessageType: "text",
  unreadCount: 0,
  isPinned: false,
  isMuted: false,
  isArchivedByViewer: false,
  isBlockedHiddenByViewer: false,
} as unknown as CommunityMessengerRoomSummary;
const withPhoto = { ...group, avatarUrl: "https://x/g.webp" } as CommunityMessengerRoomSummary;
const renamed = { ...group, title: "새 이름" } as CommunityMessengerRoomSummary;
const item = (r: CommunityMessengerRoomSummary) => ({ room: r, preview: "hi" }) as unknown as UnifiedRoomListItem;

describe("D2 홈 목록 — 사진만 바뀐 방도 새 행으로", () => {
  it("행 재사용 비교(행 memo 와 같은 함수): 사진만 다르면 다른 행", () => {
    expect(unifiedListItemRowDisplayEqual(item(group), item(withPhoto))).toBe(false);
    expect(unifiedListItemRowDisplayEqual(item(withPhoto), item({ ...withPhoto } as CommunityMessengerRoomSummary))).toBe(
      true
    );
  });

  it("정렬 캐시 키·표시 캐시 키(검색어 있음·없음): 사진만 달라도 다른 키", () => {
    expect(communityMessengerRoomsSortCacheKey([group])).not.toBe(communityMessengerRoomsSortCacheKey([withPhoto]));
    for (const kw of ["", "b"]) {
      expect(visibleChatListInputKey([item(group)], "all" as never, "all" as never, kw)).not.toBe(
        visibleChatListInputKey([item(withPhoto)], "all" as never, "all" as never, kw)
      );
    }
  });

  it("홈 동기화 지문: 사진만·제목만 바뀐 응답도 「같음」으로 버리지 않는다", () => {
    expect(fingerprintHomeSyncLists({ groups: [group] })).not.toBe(fingerprintHomeSyncLists({ groups: [withPhoto] }));
    expect(fingerprintHomeSyncLists({ groups: [group] })).not.toBe(fingerprintHomeSyncLists({ groups: [renamed] }));
    expect(fingerprintHomeSyncLists({ chats: [group] })).not.toBe(fingerprintHomeSyncLists({ chats: [withPhoto] }));
  });
});

function snap(roomId: string, roomType: string): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: "u1",
    room: { ...group, id: roomId, roomType },
    members: [],
    messages: [],
  } as unknown as CommunityMessengerRoomSnapshot;
}

function Harness(props: { roomId: string; snapshot: CommunityMessengerRoomSnapshot; refresh: MessengerRoomBootstrapRefreshFn }) {
  useMessengerRoomBootstrapLifecycle({
    roomId: props.roomId,
    initialServerSnapshot: props.snapshot,
    refresh: props.refresh,
    loadedRef: { current: false },
    setRoomReadyForRealtime: () => {},
  });
  return null;
}

const identityCalls = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.filter((c) => (c[1] as { triggerReason?: string } | undefined)?.triggerReason === "entry_group_identity");

describe("D3 그룹 방 진입 — 방 사진·제목 1회 확인", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("진입 뒤 네트워크 방 정보가 없으면 silent_delta 1회(forceSilentNetwork) — 첫 패스 뒤 refresh 가 바뀌어도 1회", () => {
    const roomId = "d3-group-a";
    const r1 = vi.fn(async () => {});
    const r2 = vi.fn(async () => {});
    act(() => root.render(<Harness roomId={roomId} snapshot={snap(roomId, "private_group")} refresh={r1} />));
    act(() => root.render(<Harness roomId={roomId} snapshot={snap(roomId, "private_group")} refresh={r2} />));
    expect(identityCalls(r1).length + identityCalls(r2).length).toBe(0);
    act(() => vi.advanceTimersByTime(CM_ROOM_ENTRY_GROUP_IDENTITY_CHECK_DELAY_MS));
    expect(identityCalls(r1)).toHaveLength(0);
    expect(identityCalls(r2)).toEqual([[true, { triggerReason: "entry_group_identity", forceSilentNetwork: true }]]);
    act(() => vi.advanceTimersByTime(60_000));
    expect(identityCalls(r2)).toHaveLength(1);
  });

  it("진입 뒤 이미 네트워크로 방 정보를 받았으면 추가 요청 없음 · 캐시 재사용은 받은 것으로 치지 않음", () => {
    const roomId = "d3-group-b";
    const r = vi.fn(async () => {});
    act(() => root.render(<Harness roomId={roomId} snapshot={snap(roomId, "private_group")} refresh={r} />));
    const before = Date.now();
    touchCmRoomForegroundLockFromSnapshot(roomId, snap(roomId, "private_group"));
    expect(hasCmRoomNetworkBootstrapSucceededSince(roomId, before)).toBe(false);
    markCmRoomSilentBootstrapSuccess(roomId);
    act(() => vi.advanceTimersByTime(CM_ROOM_ENTRY_GROUP_IDENTITY_CHECK_DELAY_MS));
    expect(identityCalls(r)).toHaveLength(0);
  });

  it("1:1 방은 진입 확인 요청을 보내지 않는다(진입 핫패스 불변)", () => {
    const roomId = "d3-direct";
    const r = vi.fn(async () => {});
    act(() => root.render(<Harness roomId={roomId} snapshot={snap(roomId, "direct")} refresh={r} />));
    act(() => vi.advanceTimersByTime(CM_ROOM_ENTRY_GROUP_IDENTITY_CHECK_DELAY_MS * 2));
    expect(identityCalls(r)).toHaveLength(0);
  });

  it("확인 전에 방을 나가면(언마운트) 요청하지 않는다", () => {
    const roomId = "d3-group-c";
    const r = vi.fn(async () => {});
    act(() => root.render(<Harness roomId={roomId} snapshot={snap(roomId, "private_group")} refresh={r} />));
    act(() => root.render(<></>));
    act(() => vi.advanceTimersByTime(CM_ROOM_ENTRY_GROUP_IDENTITY_CHECK_DELAY_MS));
    expect(identityCalls(r)).toHaveLength(0);
  });
});
