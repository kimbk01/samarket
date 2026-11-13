import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 방 정보 시트 R6 (docs/design/group-room-info-sheet-r6-design-2026-11-13.md · Owner 「12px·시안」·「시안 승인」 2026-11-13).
 * 운영 측정: 같은 시트 안 모서리 12px(#215 가 바꾼 곳) ↔ 4px(그대로 둔 41곳) 섞임 · 오픈 그룹 체크박스 기본 파랑.
 */
const SHEETS = "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx";

function infoSheetSource(): string {
  const lines = readFileSync(SHEETS, "utf8").split("\n");
  const s = lines.findIndex((l) => l.includes('vm.activeSheet === "info" ? ('));
  const e = lines.findIndex((l, i) => i > s && l.includes('vm.activeSheet === "'));
  expect(s).toBeGreaterThan(0);
  expect(e).toBeGreaterThan(s);
  return lines.slice(s, e).join("\n");
}

describe("R6-1 방 정보 시트 모서리 = 팝업 계약", () => {
  it("시트 안 4px(rounded-ui-rect) 0곳 — 카드·입력·권한 줄 12px, 작은 배지 8px", () => {
    const src = infoSheetSource();
    expect(src).not.toContain("rounded-ui-rect");
    expect((src.match(/rounded-\[length:var\(--overlay-radius-md\)\]/g) ?? []).length).toBeGreaterThanOrEqual(34);
    const badges = src.match(/rounded-\[length:var\(--overlay-radius-sm\)\][^"`]*px-2 py-1[^"`]*sam-text-xxs/g) ?? [];
    expect(badges.length).toBe(5);
  });
});

describe("R6-2 오픈 그룹 「공개 목록 노출」 체크박스 브랜드 색", () => {
  it("D9 와 같은 클래스를 덧붙인다(원래 클래스 유지)", () => {
    const src = infoSheetSource();
    expect(src).toContain(
      "className={`h-4 w-4 rounded border-sam-border text-sam-fg focus:ring-sam-border ${GROUP_PERMISSION_CHECKBOX_CLASS}`}"
    );
  });
});

describe("디자인 시스템 모서리 기준", () => {
  it("시트·다이얼로그 안 버튼·카드·입력 12px · 작은 배지 8px 명시", () => {
    const doc = readFileSync("docs/customer-platform/04-DESIGN-SYSTEM.md", "utf8");
    expect(doc).toContain("시트·다이얼로그 안 버튼·카드·입력 `--overlay-radius-md` 12px · 시트 안 작은 배지 `--overlay-radius-sm` 8px");
  });
});
