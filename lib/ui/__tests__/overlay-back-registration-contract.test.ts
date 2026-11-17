/**
 * D5 정적 검사 — 「열림」을 등록한 화면(메뉴·팝업·시트·패널)은 Android ◁ 처리에도 등록해야 한다.
 * 감사 docs/audit/android-system-nav-2026-11-17/README.md · Owner 「Start F1·F2·F3」 2026-11-17.
 *
 * `useRegisterOpenOverlay(x)` 는 팝업 광고 보류용 등록일 뿐 ◁ 를 처리하지 않는다. 그런 화면이 ◁ 처리에 등록하지 않으면
 * 열린 채 ◁ 를 눌렀을 때 화면이 닫히지 않고 아래 화면이 넘어간다(실측: LOUNGE 글 「⋯」 메뉴).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["components", "app"];

/** ◁ 를 처리하는 공용 수단 — 이 중 하나를 쓰면 등록된 것으로 본다. */
const BACK_HANDLERS = [
  "useOverlayHardwareBack",
  "pushOverlayBackEntry",
  "DibayOverlayRoot",
  "DibayBottomSheet",
  "DibayDialog",
  "DibayFullSheet",
  "DibayUsableAreaSheet",
  "DibayConfirmDialog",
  "MessengerSheetUi",
  "SupportSheetShell",
];

/** 예외 — 이유를 반드시 적는다. 새로 넣을 때는 Owner 승인 근거를 같이 적는다. */
const EXEMPT: Record<string, string> = {
  "components/philife/PhilifeWriteBottomSheet.tsx":
    "하위 폼 usePhilifeWriteLeaveGuard 가 useOverlayHardwareBack 로 ◁ 를 처리(작성 중 확인 포함)",
  "components/auth/OAuthProviderLoginPanel.tsx": "앱 어디에도 장착되지 않음(시험에서만 렌더)",
  "components/chats/TradeChatEntryCreatingOverlay.tsx":
    "닫기 수단 없는 진행 표시(채팅방 만드는 중) — ◁ 처리 방식은 Owner 결정 필요(감사 2026-11-17 보고)",
};

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
}

describe("열린 화면은 Android ◁ 처리에 등록된다 (D5)", () => {
  it("useRegisterOpenOverlay 사용처마다 ◁ 등록 또는 사유 있는 예외", () => {
    const files: string[] = [];
    for (const r of ROOTS) walk(r, files);
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (!src.includes("useRegisterOpenOverlay(")) continue;
      if (EXEMPT[f]) continue;
      if (!BACK_HANDLERS.some((h) => src.includes(h))) missing.push(f);
    }
    expect(missing).toEqual([]);
  });

  it("예외 목록의 파일은 실제로 존재한다(죽은 예외 금지)", () => {
    for (const f of Object.keys(EXEMPT)) {
      expect(() => statSync(f), f).not.toThrow();
    }
  });
});
