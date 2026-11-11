import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isCmGroupCallEnabled } from "@/lib/community-messenger/call-phase0-basics";

/**
 * 그룹 통화 보류(Owner 2026-11-09 「그룹 통화 가능은 제거 해라」) —
 * 그룹방의 통화 진입점은 모두 계약 플래그 `isCmGroupCallEnabled()` 뒤에 있어야 한다.
 */
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("그룹 통화 보류 — 그룹방 진입점 게이트", () => {
  it("계약 플래그는 꺼져 있다", () => {
    expect(isCmGroupCallEnabled()).toBe(false);
  });

  it("시작 함수: 플래그가 꺼져 있으면 즉시 반환", () => {
    const src = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    const start = src.indexOf("const startGroupCall = useCallback(");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, start + 400);
    expect(body).toMatch(/if \(!isCmGroupCallEnabled\(\)\) return;/);
  });

  it("방 메뉴: 그룹 통화 상태·음성/영상 버튼·발신 확인창이 플래그 뒤에 있다", () => {
    const src = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx");
    const gate = src.indexOf("{isCmGroupCallEnabled() ? (");
    const voice = src.indexOf('vm.t("cm_ui_group_voice_call")');
    const video = src.indexOf('vm.t("cm_ui_group_video_call")');
    expect(gate).toBeGreaterThan(-1);
    expect(voice).toBeGreaterThan(gate);
    expect(video).toBeGreaterThan(gate);
    expect(src).toContain("{vm.isGroupRoom && isCmGroupCallEnabled() ? (");
    expect(src).toContain("{groupOutgoingConfirmKind && isCmGroupCallEnabled() ? (");
  });

  it("대화 화면: 상단 「그룹 통화 …」 문구와 그룹방 통화 기록 다시 걸기가 플래그 뒤에 있다", () => {
    const src = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx");
    expect(src).toContain("{vm.isGroupRoom && isCmGroupCallEnabled() ? ` · ${vm.groupCallStatusLabel}` : \"\"}");
    /** 통화 버튼 통합 2판 (2026-11-12): 그룹방 분기가 먼저 — 플래그가 꺼져 있으면 다시 걸기 없음 */
    expect(src).toContain("const redialIsGroupRoom = vm.isGroupRoom;");
    expect(src).toMatch(
      /if \(redialIsGroupRoom\) \{[\s\S]*?if \(!isCmGroupCallEnabled\(\) \|\| redialRoomUnavailable\) \{\s*showMessengerSnackbar\([^)]*\)[^;]*;\s*return;\s*\}\s*setStubRedialConfirmKind\(kind\);/,
    );
  });
});
