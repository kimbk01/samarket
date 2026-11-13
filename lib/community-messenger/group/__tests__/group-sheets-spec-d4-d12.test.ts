import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import { safeTranslate } from "@/lib/i18n/safe-translate";

/**
 * 그룹 채팅 결함 D4~D12 (docs/design/group-chat-audit-design-2026-11-13.md · PR G — 화면 규격).
 * 증거 캡처: docs/design/group-chat-audit-2026-11-13/07~12.png
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const SHEETS = "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx";
const TIMELINE = "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx";
const PICKER = "components/community-messenger/group/CommunityMessengerGroupMemberPicker.tsx";
const FRIEND_PICKER = "components/community-messenger/MessengerFriendPickerScreen.tsx";

describe("D4 방 안내 칩 「비공개 그룹 · 2명」 띄어쓰기", () => {
  it("화면 번역은 앞뒤 공백을 자르므로 구분자는 코드에서, 숫자는 공백 없는 키로", () => {
    expect(safeTranslate("ko", "cm_ui_member_count_suffix" as never, { vars: { count: 2 } })).toBe("· 2명");
    expect(safeTranslate("ko", "cm_ui_member_count_label" as never, { vars: { count: 2 } })).toBe("2명");
    expect(safeTranslate("en", "cm_ui_member_count_label" as never, { vars: { count: 2 } })).toBe("2 members");
    const src = read(TIMELINE);
    expect(src).toContain('` · ${vm.t("cm_ui_member_count_label", { count: vm.timelineMemberCount })}`');
    expect(src).not.toContain('vm.t("cm_ui_member_count_suffix"');
  });
});

describe("D5 「음성 통화」 라벨 → 음성 메시지 수", () => {
  it("방 정보·미디어 시트의 음성 메시지 수 칸은 음성 메시지 라벨", () => {
    const src = read(SHEETS);
    expect(src).not.toMatch(/nav_voice_call_label"\)\}<\/p>\s*<p[^>]*>\{vm\.voiceMessageCount\}/);
    expect(src.match(/\{vm\.t\("cm_ui_voice_message"\)\}<\/p>\s*<p[^>]*>\{vm\.voiceMessageCount\}/g)).toHaveLength(2);
    expect(translate("ko", "cm_ui_voice_message" as never)).toBe("음성 메시지");
  });
});

describe("D6 공유 항목 합계와 설명이 같은 4종", () => {
  it("합계(사진+음성+파일+링크) 아래 설명도 4종", () => {
    const src = read(SHEETS);
    expect(src).not.toContain('"cm_ui_photo_file_counts"');
    expect(src).toContain('vm.t("cm_ui_shared_item_counts", {');
    expect(translate("ko", "cm_ui_shared_item_counts" as never, { photos: 1, voices: 2, files: 3, links: 4 })).toBe(
      "사진 1 · 음성 2 · 파일 3 · 링크 4"
    );
  });
});

describe("D7 참가자 시트 멤버 사진", () => {
  it("참가자 행에 40px 멤버 사진", () => {
    const src = read(SHEETS);
    expect(src.match(/groupMemberAvatarSrc\(member\)/g)).toHaveLength(1);
    expect(src).toMatch(/src=\{groupMemberAvatarSrc\(member\)\}\s*size=\{40\}/);
  });
});

describe("D8 멤버 초대 탭 위 틈", () => {
  it("선택기 탭 줄이 시트 위 여백만큼 올라가 고정된다 (초대 시트만)", () => {
    expect(read(PICKER)).toContain("${Sam.tabs.bar}${tabsBarClassName ? ` ${tabsBarClassName}` : \"\"}");
    const src = read(SHEETS);
    expect(src).toContain('const INVITE_SHEET_TABS_STICKY_TOP_CLASS = "top-[-1.25rem]";');
    expect(src).toContain("tabsBarClassName={INVITE_SHEET_TABS_STICKY_TOP_CLASS}");
    expect(src).toContain('"p-5 pb-[max(1.25rem,var(--kb-safe-bottom))]"');
  });
});

describe("D9 권한 체크박스 색", () => {
  it("권한 체크박스 6개 모두 팝업 브랜드 색", () => {
    const src = read(SHEETS);
    expect(src.match(/disabled=\{!vm\.canManageGroupPermissions\} className=\{GROUP_PERMISSION_CHECKBOX_CLASS\} \/>/g)).toHaveLength(6);
    expect(src).toContain('const GROUP_PERMISSION_CHECKBOX_CLASS = "accent-[color:var(--overlay-primary)]";');
  });
});

describe("D10 시트 「이전 화면」 버튼 하나의 모양", () => {
  it("직접 테두리 상자 클래스 0 · 이전 화면은 모두 OverlayUi.textActionMuted", () => {
    const src = read(SHEETS);
    expect(src).not.toContain('className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"');
    const backs = src.match(/className=\{OverlayUi\.textActionMuted\}\s*>\s*\{vm\.t\("tier1_back"\)\}/g) ?? [];
    expect(backs.length).toBe(7);
  });
});

describe("D11 그룹 만들기 버튼", () => {
  it("투명도 비활성·투명도 눌림 대신 앱 기준 버튼(회색 비활성·진해짐)", () => {
    const src = read(FRIEND_PICKER);
    expect(src).not.toContain("disabled:opacity-40");
    expect(src).toContain("className={`${Sam.btn.primary} h-[50px] w-full rounded-[12px] text-[16px] font-bold`}");
  });
});

describe("D12 서랍 그룹 사진 대체 표시", () => {
  it("제목 첫 글자 대신 그룹 아이콘(GroupDomainAvatar) 2곳", () => {
    const src = read(SHEETS);
    expect(src).not.toMatch(/room\.title\.trim\(\)\.slice\(0, 1\)/);
    expect(src).not.toMatch(/privateGroupTitle\.trim\(\)\.slice\(0, 1\)/);
    expect(src.match(/<GroupDomainAvatar\b/g)).toHaveLength(2);
  });
});
