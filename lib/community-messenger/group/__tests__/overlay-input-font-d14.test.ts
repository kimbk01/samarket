import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/**
 * 그룹 결함 D14 (docs/design/group-chat-audit-design-2026-11-13.md · PR I) + R6 에서 넘긴 방 정보 시트 글 입력칸 2곳.
 * 운영 측정: 팝업 입력(.dibay-overlay-input, 16px)이 Android 에서 14px —
 * 전역 입력 규칙(globals.css, 레이어 밖·선택자 우선순위 높음)이 덮었다. iOS 는 별도 16px !important 규칙.
 */
const globals = readFileSync("app/globals.css", "utf8");
const overlay = readFileSync("app/dibay-overlay.css", "utf8");

describe("D14 팝업 입력 글자 16px", () => {
  it("전역 14px 규칙이 팝업 입력·팝업 글 입력칸을 제외한다", () => {
    const rule = /\):not\(\.sam-input\)[^{]*\{\s*font-size: var\(--sam-text-body-size\);/.exec(globals);
    expect(rule).not.toBeNull();
    expect(rule![0]).toContain(".dibay-overlay-input");
    expect(rule![0]).toContain(".dibay-overlay-textarea");
  });

  it("팝업 입력 16px · 팝업 글 입력칸 16px(글자만)", () => {
    expect(overlay).toMatch(/\.dibay-overlay-input \{[^}]*font-size: 16px;/);
    expect(overlay).toMatch(/\.dibay-overlay-textarea \{\s*font-size: 16px;\s*\}/);
    expect(OverlayUi.textarea).toBe("dibay-overlay-textarea");
  });

  it("방 정보 시트 글 입력칸 2곳(그룹 공지·오픈 그룹 소개)이 팝업 글 입력칸 클래스를 쓴다", () => {
    const sheets = readFileSync(
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx",
      "utf8"
    );
    expect(sheets.match(/sam-text-body outline-none focus:border-sam-border \$\{OverlayUi\.textarea\}/g)).toHaveLength(2);
  });
});
