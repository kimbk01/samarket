import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SPL-05 — 메신저 방 시트: 방에는 하단 탭이 없으므로 기기 하단부터, Android 뒤로 = 시트만 닫기.
 */
const src = readFileSync(
  join(process.cwd(), "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx"),
  "utf8"
);

describe("room sheets anchor + back (SPL-05)", () => {
  it("does not offset room sheets above a (non-existent) bottom nav", () => {
    expect(src).not.toContain("MAIN_BOTTOM_NAV_SHEET_BOTTOM_CLASS");
    expect(src).toContain("`fixed inset-0 ${OVERLAY_Z_CLASS.sheet} flex flex-col justify-end`");
  });

  it("panels own their safe-bottom padding", () => {
    expect(src).toContain('"p-5 pb-[max(1.25rem,var(--safe-bottom))]"');
    expect(src).toContain("pb-[max(0.75rem,var(--safe-bottom))]");
  });

  it("registers the INAPP-07 overlay back only while a sheet is open", () => {
    expect(src).toContain("useOverlayHardwareBack(Boolean(vm.activeSheet), dismissSheet)");
  });
});
