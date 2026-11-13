// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

/**
 * D13 (시안 docs/design/group-room-drawer-d13-mockup-2026-11-13.html · Owner 「시안대로 구현」 2026-11-13):
 * 그룹 ⋮ 서랍 안 같은 기능은 한 곳만 —
 * 설정 카드에 56px 사진·「참가자」 버튼·「알림 끄기」 버튼 없음, 「사진 (갤러리)」 버튼은 아래 72px 사진 줄(편집 권한만),
 * 참여자 보기는 대화상대 목록·「전체 보기」, 알림 끄기는 아래 목록 행.
 * 실제 서랍 컴포넌트를 그려서(화면 모델만 대체) 확인한다.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ vm: null as Record<string, unknown> | null }));

vi.mock("@/components/community-messenger/room/phase2/messenger-room-phase2-view-context", () => ({
  useMessengerRoomPhase2SheetsView: () => h.vm,
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, safeT: (k: string) => k, locale: "ko" }),
}));
vi.mock("@/components/community-messenger/group/GroupJoinRequestsSection", () => ({
  GroupJoinRequestsSection: () => <div data-testid="join-requests" />,
}));
vi.mock("@/components/community-messenger/group/GroupBlockedMembersSection", () => ({
  GroupBlockedMembersSection: () => <div data-testid="blocked-members" />,
}));

import { CommunityMessengerRoomPhase2RoomSheets } from "@/components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets";

function makeVm(opts: { canEdit: boolean; isMuted?: boolean }) {
  const base: Record<string, unknown> = {
    activeSheet: "menu",
    isGroupRoom: true,
    isPrivateGroupRoom: true,
    isMoimRoom: false,
    isOwner: opts.canEdit,
    canEditPrivateGroupMeta: opts.canEdit,
    canInviteMembers: true,
    canKickGroupMembers: opts.canEdit,
    canEditGroupNotice: opts.canEdit,
    busy: null,
    roomId: "room-1",
    t: (k: string) => k,
    privateGroupTitle: "B2B TEST",
    privateGroupAvatarUrl: null,
    groupInviteLinkState: { inviteUrl: "https://x/group/abc" },
    roomNotice: null,
    myRoleLabel: opts.canEdit ? "owner" : "member",
    photoMessageCount: 0,
    voiceMessageCount: 0,
    fileMessageCount: 0,
    linkMessageCount: 0,
    sortedMembers: [
      { id: "me", label: "zxzx11", memberRole: "owner", identityMode: "real_name" },
      { id: "peer", label: "q테스트1", memberRole: "member", identityMode: "real_name" },
    ],
    managementEventMessages: [],
    snapshot: {
      viewerUserId: "me",
      members: [],
      room: {
        id: "room-1",
        title: "B2B TEST",
        avatarUrl: null,
        memberCount: 2,
        onlineCount: 1,
        ownerUserId: "me",
        isMuted: Boolean(opts.isMuted),
        isArchivedByViewer: false,
        roomStatus: "active",
        chatDomain: "group",
      },
    },
  };
  /** 서랍 그리기에 쓰이지 않는 함수·값은 이름만 있으면 된다 */
  return new Proxy(base, {
    get(target, key: string) {
      if (key in target) return target[key];
      return () => undefined;
    },
  });
}

function renderDrawer(vm: Record<string, unknown>) {
  h.vm = vm;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CommunityMessengerRoomPhase2RoomSheets />));
  const card = [...host.querySelectorAll("div")].find((d) =>
    d.textContent?.startsWith("nav_messenger_private_group")
  ) as HTMLElement;
  const buttonsIn = (el: Element) => [...el.querySelectorAll("button")].map((b) => b.textContent?.trim());
  const photoRow = host.querySelector("[data-group-drawer-photo-row]") as HTMLElement;
  const all = buttonsIn(host);
  const cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { host, card, photoRow, buttonsIn, all, cleanup };
}

describe("D13 그룹 서랍 중복 정리", () => {
  it("방장: 설정 카드에 사진·참가자·알림 끄기 버튼 없음, 사진 버튼은 72px 사진 줄", () => {
    const r = renderDrawer(makeVm({ canEdit: true }));
    expect(r.card).toBeTruthy();
    const cardButtons = r.buttonsIn(r.card);
    expect(cardButtons).toEqual([
      "nav_messenger_save_room_settings",
      "nav_messenger_invite_members",
      "cm_ui_group_invite_copy_link",
    ]);
    expect(r.card.querySelectorAll('input[type="file"]')).toHaveLength(0);
    /** 그룹 사진은 서랍 전체에서 72px 1곳 */
    expect(r.host.querySelectorAll('[style*="width: 56px"]')).toHaveLength(0);
    expect(r.photoRow).toBeTruthy();
    expect(r.buttonsIn(r.photoRow)).toEqual(["cm_ui_photo_gallery"]);
    expect(r.photoRow.querySelectorAll('input[type="file"]')).toHaveLength(1);
    /** 같은 기능은 한 곳씩 */
    expect(r.all.filter((t) => t === "cm_ui_photo_gallery")).toHaveLength(1);
    expect(r.all.filter((t) => t === "nav_messenger_participants")).toHaveLength(0);
    expect(r.all.filter((t) => t?.startsWith("cm_ui_turn_off_room_notifications"))).toHaveLength(1);
    expect(r.all.filter((t) => t?.startsWith("cm_ui_members_invites_view_all"))).toHaveLength(1);
    r.cleanup();
  });

  it("일반 멤버: 설정 카드 = 멤버 초대·초대 링크 복사만, 사진 버튼 없음", () => {
    const r = renderDrawer(makeVm({ canEdit: false }));
    expect(r.buttonsIn(r.card)).toEqual(["nav_messenger_invite_members", "cm_ui_group_invite_copy_link"]);
    expect(r.buttonsIn(r.photoRow)).toEqual([]);
    expect(r.host.querySelectorAll('input[type="file"]')).toHaveLength(0);
    expect(r.all.filter((t) => t === "nav_messenger_participants")).toHaveLength(0);
    r.cleanup();
  });

  it("알림이 꺼진 방: 켜기 문구도 아래 목록 행 1곳", () => {
    const r = renderDrawer(makeVm({ canEdit: true, isMuted: true }));
    expect(r.all.filter((t) => t?.startsWith("cm_ui_turn_on_room_notifications"))).toHaveLength(1);
    expect(r.buttonsIn(r.card)).not.toContain("cm_ui_turn_on_room_notifications");
    r.cleanup();
  });
});
