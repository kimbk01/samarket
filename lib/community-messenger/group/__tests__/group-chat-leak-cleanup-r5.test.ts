import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getMessengerRoomActionErrorMessage } from "@/lib/community-messenger/room/messenger-room-action-error-messages";
import { translate } from "@/lib/i18n/messages";

/** 재감사 R5 (docs/design/group-chat-reaudit-2026-11-13.md §4·§6 R5) — 누수 정리 */
const ko = (key: string, vars?: Record<string, string | number>) => translate("ko", key as never, vars);

describe("R5 오류 문구 연결", () => {
  it("그룹 프로필 저장 거절 사유가 일반 문구 대신 이유 안내", () => {
    expect(getMessengerRoomActionErrorMessage("title_required", ko)).toBe("그룹방 제목을 입력해 주세요.");
    expect(getMessengerRoomActionErrorMessage("invalid_avatar_url", ko)).toBe(
      "이 사진은 그룹 사진으로 쓸 수 없습니다. 다시 올려 주세요."
    );
  });
});

describe("R5 그룹 사진 올리기 400 사유별", () => {
  it("서버가 사유 코드를 함께 내려준다(기존 error 문장은 그대로)", () => {
    const src = readFileSync("app/api/me/profile/avatar/route.ts", "utf8");
    for (const code of ["multipart_required", "file_required", "too_large", "unsupported_type"]) {
      expect(src).toContain(`code: "${code}"`);
    }
  });
  it("화면은 형식 오류(unsupported_type)만 형식 안내, 다른 400 은 일반 오류", () => {
    const src = readFileSync("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts", "utf8");
    expect(src).toContain('uploadJson.code === "unsupported_type"');
    expect(src).not.toMatch(/uploadRes\.status === 400\s*\?\s*translateCmUi\("cm_ui_group_photo_type_only"\)/);
  });
});

describe("R5 안 쓰는 키·값·상수 삭제", () => {
  it("초대 링크 키 11개·배지 키 2개가 카탈로그에 없다", () => {
    const cat = readFileSync("lib/i18n/catalog/community-messenger-ui.ts", "utf8");
    for (const k of [
      "cm_ui_group_invite_link",
      "cm_ui_group_invite_regenerate",
      "cm_ui_group_invite_disable",
      "cm_ui_group_invite_link_disabled",
      "cm_ui_group_invite_create_link",
      "cm_ui_group_invite_link_name_ph",
      "cm_ui_group_invite_requires_approval",
      "cm_ui_group_invite_links_list",
      "cm_ui_group_invite_default_link",
      "cm_ui_group_invite_instant_join",
      "cm_ui_group_invite_revoke",
      "cm_ui_group_role_owner_badge",
      "cm_ui_group_role_admin_badge",
    ]) {
      expect(cat, k).not.toMatch(new RegExp(`\\b${k}:`));
    }
  });
  it("컨트롤러 groupInviteLinkLoading · GROUP_ROOM_ERROR.INVALID_AVATAR_URL 없음", () => {
    expect(readFileSync("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts", "utf8")).not.toContain(
      "groupInviteLinkLoading"
    );
    expect(readFileSync("lib/community-messenger/group/group-room-errors.ts", "utf8")).not.toContain("INVALID_AVATAR_URL");
  });
});

describe("R5 롤백 파일", () => {
  it("G3 마이그레이션 되돌리기 실행 파일 — 새 문장 2곳을 원래 문장으로, 1회가 아니면 중단", () => {
    const p = "supabase/rollback/20271114100000_cm_lite_bundle_room_avatar_url_rollback.sql";
    expect(existsSync(p)).toBe(true);
    const sql = readFileSync(p, "utf8");
    expect(sql).toContain("execute replace(replace(v_def, v_new_a, v_old_a), v_new_b, v_old_b);");
    expect(sql).toContain("<> 1 then raise exception 'lite bundle 새 문장 A 불일치'");
    expect(sql).toContain("<> 1 then raise exception 'lite bundle 새 문장 B 불일치'");
  });
});
