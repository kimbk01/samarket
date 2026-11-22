import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * S4 (Owner 승인 2026-11-18 · docs/audit/android-system-nav-2026-11-17/s2-s4-design.md):
 * Android 의 ◁ 는 맨 위에 떠 있는 팝업·대화상자만 닫는다(AOSP PopupWindow: BACK·ESCAPE → dismiss, Dialog: cancel).
 * 웹으로 그린 떠 있는 창은 Android 가 볼 수 없으므로, 떠 있는 동안 ◁ 처리 목록(overlay-back-stack)에 올려야 한다.
 * 「떠 있는 창」 = 이 코드베이스가 스스로 `useRegisterOpenOverlay` 로 등록한 창 + `role="menu"` 메뉴.
 */
const BACK_REGISTERED =
  /useOverlayHardwareBack\(|<DibayOverlayRoot|<DibayBottomSheet|<DibayUsableAreaSheet|<DibayFullSheet|<MessengerHomeBottomSheetShell|<SupportSheetShell/;

/** 등록하지 않는 이유가 있는 곳 — 새 창을 여기에 넣으려면 이유가 있어야 한다. */
const EXEMPT: Record<string, string> = {
  "components/common/media/DibayImageViewer.tsx": "자체 기록(pushState) — ◁ 가 popstate 로 이미 닫음",
  "components/philife/PhilifeMessengerFromHeaderStack.tsx": "주소 경로로 열고 닫음 — ◁(웹 뒤로)로 이미 닫힘",
  "components/trade/TradeHistoryFromHeaderStack.tsx": "주소 경로로 열고 닫음 — ◁(웹 뒤로)로 이미 닫힘",
  "components/chats/TradeChatEntryCreatingOverlay.tsx": "사용자가 닫을 수 없는 진행 표시(닫기 없음)",
  "components/auth/OAuthProviderLoginPanel.tsx": "로그인 진행 패널 — 별도 설계 필요(S4 범위 밖)",
  "components/philife/PhilifeWriteBottomSheet.tsx": "글쓰기 시트 — 임시저장 규칙, 별도 설계 필요(S4 범위 밖)",
  "components/trade/TradeWriteBottomSheet.tsx": "글쓰기 시트 — 임시저장 규칙, 별도 설계 필요(S4 범위 밖)",
  "components/trade/TradeWriteSheetLoadingFrame.tsx": "글쓰기 시트 준비 화면 — 글쓰기 시트와 함께 별도 설계",
  "components/philife/PhilifeWriteSheetLoadingFrame.tsx": "글쓰기 시트 준비 화면 — 글쓰기 시트와 함께 별도 설계(거래와 같음)",
  "components/admin/shell/AdminHeaderAccountMenu.tsx": "관리자 화면 — Android 앱 동선 아님",
  "components/ui/dibay-overlay/DibaySheetParts.tsx": "시트 부품 — 시트 자체가 등록됨",
};

function listFiles(pattern: string): string[] {
  const out = execSync(`git grep -l -E '${pattern}' -- components app`, { encoding: "utf8" });
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => /\.tsx?$/.test(s) && !s.includes("__tests__"));
}

describe("떠 있는 창은 ◁ 에 등록 (S4)", () => {
  const files = Array.from(
    new Set([...listFiles("useRegisterOpenOverlay\\("), ...listFiles('role="menu"')]),
  ).sort();

  it("대상 목록을 찾는다", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)("%s", (file) => {
    if (EXEMPT[file]) return;
    const src = readFileSync(file, "utf8");
    expect(BACK_REGISTERED.test(src), `${file} 는 떠 있는 동안 ◁ 처리 목록에 등록해야 한다`).toBe(true);
  });

  it("예외 목록의 파일은 실제로 있다", () => {
    for (const file of Object.keys(EXEMPT)) {
      expect(() => readFileSync(file, "utf8")).not.toThrow();
    }
  });
});
