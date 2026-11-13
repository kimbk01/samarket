import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 그룹 ⋮ 서랍 SSOT (Owner 2026-11-12 실기 감사 · docs/design/group-room-drawer-fix-design-2026-11-12.md PR A).
 * S1 상태바 간섭 0 · S2 초대 링크 = 복사 버튼 1개 · S3 버튼/행 = 팝업 SSOT 부품 · S4 서랍에서도 멤버 첫 페이지 · S5 배지 한국어 키.
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const SHEETS = "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx";

function groupDrawerSource(src: string): string {
  const a = src.indexOf('{vm.activeSheet === "menu" && vm.isGroupRoom ? (');
  const b = src.indexOf('{vm.activeSheet === "members" ? (');
  expect(a).toBeGreaterThan(0);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
}

/** 그룹 통화 블록은 통화 변경 규정(Owner 11-12 「통화 손대지 않음」)으로 이번 범위 밖 — 검사에서 제외 */
function withoutGroupCallBlock(part: string): string {
  const a = part.indexOf("{isCmGroupCallEnabled() ? (");
  if (a < 0) return part;
  const b = part.indexOf(") : null}", a);
  expect(b).toBeGreaterThan(a);
  return part.slice(0, a) + part.slice(b);
}

function infoSheetSource(src: string): string {
  const a = src.indexOf('{vm.activeSheet === "info" ? (');
  const b = src.indexOf('{vm.activeSheet === "search" ? (');
  expect(a).toBeGreaterThan(0);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe("group room drawer SSOT", () => {
  it("S1: 그룹 서랍 컨테이너는 --safe-top 아래에서 시작한다 (상태바 간섭 0)", () => {
    const src = read(SHEETS);
    expect(src).toMatch(/isGroupMenuDrawer\s*\?[\s\S]{0,400}`fixed inset-0 \$\{OVERLAY_Z_CLASS\.sheet\} flex justify-end pt-\[var\(--safe-top\)\]`/);
  });

  it("S2: 초대 링크는 「초대 링크 복사」 버튼 1개 — 주소·재생성·비활성화·링크 목록 화면 없음", () => {
    const drawer = groupDrawerSource(read(SHEETS));
    expect(drawer).toContain('vm.t("cm_ui_group_invite_copy_link")');
    expect(drawer).toContain("vm.copyGroupInviteLink()");
    /** 주소 글자를 그리지 않는다 (버튼 비활성 판정에만 사용) */
    expect(drawer).not.toMatch(/>\s*\{vm\.groupInviteLinkState\.inviteUrl\}/);
    expect(drawer).not.toContain("regenerateGroupInviteLink");
    expect(drawer).not.toContain("disableGroupInviteLink");
    expect(existsSync(join(root, "components/community-messenger/group/GroupInviteLinkSection.tsx"))).toBe(false);
    const ctrl = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    expect(ctrl).toContain("useGroupRoomInviteLink(streamRoomId, Boolean(canInviteMembers && snapshot))");
    expect(ctrl).not.toContain("regenerate-link");
    const joinReq = read("components/community-messenger/group/GroupJoinRequestsSection.tsx");
    expect(joinReq).not.toContain("invite-links");
    expect(joinReq).not.toContain("inviteUrl");
  });

  it("D16: 화면이 안 쓰는 초대 링크 쓰기 API 없음 — 남는 것은 「초대 링크 복사」 GET 1개", () => {
    const base = "app/api/community-messenger/group-rooms/[roomId]";
    expect(existsSync(join(root, base, "regenerate-link/route.ts"))).toBe(false);
    expect(existsSync(join(root, base, "invite-links/route.ts"))).toBe(false);
    expect(existsSync(join(root, base, "invite-links/[linkId]/route.ts"))).toBe(false);
    const route = read(`${base}/invite-link/route.ts`);
    expect(route).toMatch(/export async function GET\(/);
    expect(route).not.toMatch(/export async function (DELETE|POST|PATCH|PUT)\(/);
    const svc = read("lib/community-messenger/group/group-room-invite-link-service.ts");
    for (const name of [
      "listGroupInviteLinks",
      "createGroupInviteLink",
      "updateGroupInviteLink",
      "revokeGroupInviteLink",
      "regenerateGroupInviteLink",
      "disableGroupInviteLink",
    ]) {
      expect(svc).not.toContain(name);
    }
    expect(svc).toContain("export async function getGroupInviteLink(");
  });

  it("S3: 서랍·방 정보 시트 — opacity 비활성·하드코딩 색·직접 행 눌림 없음, 팝업 SSOT 부품만", () => {
    const src = read(SHEETS);
    for (const part of [withoutGroupCallBlock(groupDrawerSource(src)), infoSheetSource(src)]) {
      expect(part).not.toMatch(/disabled:opacity-/);
      expect(part).not.toContain("#006241");
      expect(part).not.toContain("#111827");
      expect(part).not.toContain("bg-sam-ink");
      expect(part).not.toContain("ROOM_SHEET_ROW_PRESS_CLASS");
      expect(part).not.toContain("<label className=\"min-h-[44px] cursor-pointer");
    }
    const drawer = groupDrawerSource(src);
    expect(drawer).toContain("dibay-overlay-menu__item dibay-overlay-menu__item--danger");
    expect(drawer).toContain("className={OverlayUi.btn.secondary}");
    for (const rel of [
      "components/community-messenger/group/GroupJoinRequestsSection.tsx",
      "components/community-messenger/group/GroupBlockedMembersSection.tsx",
      "components/community-messenger/group/GroupMemberRoleBadge.tsx",
    ]) {
      const s = read(rel);
      expect(s, rel).not.toMatch(/disabled:opacity-/);
      expect(s, rel).not.toMatch(/#00(6241|754A)/i);
    }
  });

  it("D1: 서랍 목록 상자는 세로 flex 서랍 안에서 줄어들지 않는다(shrink-0) — overflow-hidden 상자 접힘 방지", () => {
    const src = read(SHEETS);
    const m = /const GROUP_MENU_BOX_CLASS =\s*"([^"]+)"/.exec(src);
    expect(m).not.toBeNull();
    const cls = m![1].split(/\s+/);
    expect(cls).toContain("overflow-hidden");
    expect(cls).toContain("shrink-0");
    /** 서랍 패널이 세로 flex 스크롤 상자인 한 이 조건이 필요하다 */
    expect(src).toMatch(/isGroupMenuDrawer\s*\?\s*`relative z-\[1\] flex h-full min-h-0 w-full[^`]*flex-col overflow-y-auto/);
  });

  it("S4: 지연 멤버 첫 페이지는 그룹 서랍(menu)에서도 요청한다", () => {
    const p1 = read("lib/community-messenger/room/use-messenger-room-client-phase1.ts");
    expect(p1).toMatch(/sheet === "menu" && \(roomTypeForMemberPaging === "private_group" \|\| roomTypeForMemberPaging === "open_group"\)/);
  });

  it("S5: 역할 배지는 한국어 화면에서 영어 고정 글자를 쓰지 않는다", () => {
    const badge = read("components/community-messenger/group/GroupMemberRoleBadge.tsx");
    expect(badge).toContain('t("nav_messenger_owner_label")');
    expect(badge).toContain('t("cm_ui_admin")');
    expect(badge).not.toContain("cm_ui_group_role_owner_badge");
    expect(badge).not.toContain("cm_ui_group_role_admin_badge");
    expect(badge).not.toContain("uppercase");
  });
});
