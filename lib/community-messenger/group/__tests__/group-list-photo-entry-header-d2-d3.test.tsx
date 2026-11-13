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
  useMessengerRoomBootstrapLifecycle,
  type MessengerRoomBootstrapRefreshFn,
} from "@/lib/community-messenger/room/use-messenger-room-bootstrap-lifecycle";
import { markCmRoomSilentBootstrapSuccess } from "@/lib/community-messenger/room/cm-room-bootstrap-lock";
import { mergeCommunityMessengerSilentDeltaIntoSnapshot } from "@/lib/community-messenger/room/merge-community-messenger-silent-delta";
import { GroupDomainAvatar } from "@/components/community-messenger/domain-shell-canary/GroupDomainAvatar";
import { useState } from "react";
import { readFileSync } from "node:fs";
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

/** 시드로 바로 그려지는 진입(메시지 없는 실제 빈 방 = 시드 완료) — 네트워크 없이 끝나는 경로(Z1) */
function snap(roomId: string, roomType: string, avatarUrl: string | null = null): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: "u1",
    room: { ...group, id: roomId, roomType, lastMessage: "", avatarUrl },
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

/** 머리글과 같은 그룹 사진 부품으로 그리고, 진입 확인 요청이 오면 실제 silent_delta 병합으로 상태를 바꾼다 */
function HeaderChainHarness(props: { roomId: string; serverAvatarUrl: string }) {
  const [snapshot, setSnapshot] = useState(() => snap(props.roomId, "private_group", null));
  const refresh: MessengerRoomBootstrapRefreshFn = async (_silent, opts) => {
    if (opts?.triggerReason !== "entry_group_identity") return;
    const delta = { ...snap(props.roomId, "private_group", props.serverAvatarUrl) };
    (delta.room as { titleFromRoom?: boolean }).titleFromRoom = true;
    setSnapshot((prev) => mergeCommunityMessengerSilentDeltaIntoSnapshot(prev, delta));
  };
  useMessengerRoomBootstrapLifecycle({
    roomId: props.roomId,
    initialServerSnapshot: snapshot,
    refresh,
    loadedRef: { current: false },
    setRoomReadyForRealtime: () => {},
  });
  return <GroupDomainAvatar imageUrl={snapshot.room.avatarUrl} size={40} />;
}

const identityCalls = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.filter((c) => (c[1] as { triggerReason?: string } | undefined)?.triggerReason === "entry_group_identity");

/** 첫 화면 뒤 rAF 2회 */
const afterFirstPaint = () => act(() => vi.advanceTimersByTime(40));

describe("D3·재감사 R2 그룹 방 진입 — 네트워크 없이 끝나는 진입에서만 방 정보 1회", () => {
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

  it("시드 진입(Z1): 첫 화면 뒤 silent_delta 1회 — 첫 패스 뒤 refresh 가 바뀌어 효과가 다시 돌아도 1회", () => {
    const roomId = "r2-group-a";
    const r1 = vi.fn(async () => {});
    const r2 = vi.fn(async () => {});
    act(() => root.render(<Harness roomId={roomId} snapshot={snap(roomId, "private_group")} refresh={r1} />));
    act(() => root.render(<Harness roomId={roomId} snapshot={snap(roomId, "private_group")} refresh={r2} />));
    afterFirstPaint();
    expect(identityCalls(r1).length + identityCalls(r2).length).toBe(1);
    expect([...identityCalls(r1), ...identityCalls(r2)][0]).toEqual([
      true,
      { triggerReason: "entry_group_identity", forceSilentNetwork: true },
    ]);
    act(() => vi.advanceTimersByTime(60_000));
    expect(identityCalls(r1).length + identityCalls(r2).length).toBe(1);
  });

  it("첫 화면 전에 네트워크로 방 정보를 받았으면 보내지 않는다", () => {
    const roomId = "r2-group-b";
    const r = vi.fn(async () => {});
    act(() => root.render(<Harness roomId={roomId} snapshot={snap(roomId, "private_group")} refresh={r} />));
    markCmRoomSilentBootstrapSuccess(roomId);
    afterFirstPaint();
    expect(identityCalls(r)).toHaveLength(0);
  });

  it("1:1 방은 보내지 않는다(진입 때 이미 silent_delta 1회 — 운영 실측)", () => {
    const roomId = "r2-direct";
    const r = vi.fn(async () => {});
    act(() => root.render(<Harness roomId={roomId} snapshot={snap(roomId, "direct")} refresh={r} />));
    afterFirstPaint();
    expect(identityCalls(r)).toHaveLength(0);
  });

  it("나갔다가 다시 들어오면(새 진입) 다시 1회", () => {
    const roomId = "r2-group-c";
    const r = vi.fn(async () => {});
    act(() => root.render(<Harness roomId={roomId} snapshot={snap(roomId, "private_group")} refresh={r} />));
    afterFirstPaint();
    act(() => root.render(<></>));
    act(() => vi.advanceTimersByTime(5));
    act(() => root.render(<Harness roomId={roomId} snapshot={snap(roomId, "private_group")} refresh={r} />));
    afterFirstPaint();
    expect(identityCalls(r)).toHaveLength(2);
  });

  it("머리글 갱신 렌더: 진입 시 기본 그룹 아이콘 → 1회 요청 병합 뒤 서버 사진", () => {
    act(() => root.render(<HeaderChainHarness roomId="r2-group-render" serverAvatarUrl="https://x/new-group.webp" />));
    expect(host.querySelector('[data-group-avatar="placeholder"]')).not.toBeNull();
    afterFirstPaint();
    act(() => vi.advanceTimersByTime(0));
    expect(host.querySelector('[data-group-avatar="placeholder"]')).toBeNull();
    expect(host.innerHTML).toContain("new-group.webp");
  });

  it("새로고침의 캐시 재사용(Z2)·보강 건너뜀(Z3) 지점도 같은 함수를 부른다", () => {
    const src = readFileSync("lib/community-messenger/room/messenger-room-bootstrap-refresh.ts", "utf8");
    expect(src.match(/requestGroupEntryIdentityAfterFirstPaint\(\{ roomId, snapshot: primed, refresh \}\)/g)).toHaveLength(2);
    expect(readFileSync("lib/community-messenger/room/use-messenger-room-bootstrap-lifecycle.ts", "utf8")).not.toMatch(
      /setTimeout\([^)]*entry_group_identity/
    );
  });
});
