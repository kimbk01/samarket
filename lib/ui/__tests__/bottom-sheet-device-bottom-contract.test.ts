/**
 * @vitest-environment node
 *
 * Owner 2026-11-01 — 모든 사용자 바텀시트는 기기 맨 아래(`bottom: 0`)에서 열리고 하단 탭을 덮는다.
 * safe-bottom 은 시트 안에서 한 번만. 시트 안 버튼 = 눌림(진해짐 + 0.98) · 비활성 회색 토큰.
 * `docs/audit/bottom-sheet-device-bottom-cta-audit-2026-11-01.md`
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (name === "node_modules" || name === "__tests__") continue;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

describe("bottom sheets start at the device bottom (no gap under the sheet)", () => {
  it("no source opts a sheet into the removed above-bottom-nav placement", () => {
    const offenders = [...walk("components"), ...walk("app")].filter((rel) => {
      const src = read(rel);
      return src.includes('anchor="above-bottom-nav"') || src.includes("sheetAnchor");
    });
    expect(offenders).toEqual([]);
  });

  it("Dibay sheet root has no nav offset; panel owns safe-bottom once (0 while the keyboard is open)", () => {
    const css = read("app/dibay-overlay.css");
    expect(css).not.toContain("data-sheet-anchor");
    // 토스트(`.dibay-toast-stack`)는 탭 위 그대로 — 시트 규칙에만 탭 높이가 없어야 한다
    expect(css).not.toMatch(/dibay-overlay-(root--sheet|sheet)[^{]*\{[^}]*--app-bottom-nav-height/);
    expect(css).toContain(
      "padding-bottom: max(var(--overlay-space-4), var(--kb-safe-bottom, var(--safe-bottom, 0px)));"
    );
    expect(read("lib/main-menu/bottom-nav-config.ts")).not.toContain("MAIN_BOTTOM_NAV_SHEET_BOTTOM_CLASS");
  });

  it("messenger home sheets sit at the device bottom (fit-content default)", () => {
    const css = read("app/messenger-home-bottom-sheet.css");
    expect(css).toMatch(/\.messenger-home-bottom-sheet-panel\s*\{\s*bottom:\s*0;/);
    expect(css).not.toContain("--app-bottom-nav-height");
    const shell = read("components/community-messenger/MessengerSheetUi.tsx");
    expect(shell).toContain('anchor = "fit-content"');
    expect(shell).not.toContain("above-bottom-nav");
  });

  it("messenger sheets that had no safe padding now end above the system nav once", () => {
    /** 채팅 검색은 시트가 아니라 하위 화면(채팅 시안 4판 「8」) — 「새 대화」 시트가 아래 여백을 한 번 가진다 */
    expect(read("components/community-messenger/MessengerNewConversationSheet.tsx")).toContain(
      "pb-[max(18px,var(--safe-bottom))]"
    );
    expect(read("components/community-messenger/CommunityMessengerHome.tsx")).toContain(
      "pb-[max(1rem,var(--kb-safe-bottom))]"
    );
  });

  it("hand-rolled bottom sheets reserve the safe area", () => {
    for (const rel of [
      "components/community-messenger/room/phase2/StoreOrderBuyerRoomSheet.tsx",
      "components/chats/StoreOrderSellerOrderPanel.tsx",
      "components/stores/commission/StoreCommissionLedgerTable.tsx",
    ]) {
      expect(read(rel), rel).toMatch(/pb-\[(max\(1rem,)?var\(--(safe-bottom\)|kb-safe-bottom,var\(--safe-bottom,0px\)\))\)?\]/);
    }
  });

  it("footer that already owns safe-bottom turns the panel safe padding off (no double)", () => {
    expect(read("components/stores/store-order-detail/StoreCartPreviewSheet.tsx")).toContain(
      "contentPaddingBottomPx={0}"
    );
  });
});

describe("sheet CTA press + disabled tokens (UI·CTA 공통 기준 §1-4)", () => {
  it("overlay buttons: disabled is a gray token, not opacity", () => {
    const css = read("app/dibay-overlay.css");
    expect(css).not.toMatch(/\.dibay-overlay-btn:disabled\s*\{[^}]*opacity:\s*0\.45/);
    expect(css).toMatch(/\.dibay-overlay-text-action:not\(:disabled\):active\s*\{[^}]*scale\(var\(--overlay-press-scale\)\)/);
  });

  it("Sam buttons inside sheets/dialogs scale on press", () => {
    expect(read("app/samarket-components.css")).toContain(
      '[role="dialog"] :is(.sam-btn, .sam-btn-primary, .sam-btn-secondary, .sam-btn-ghost, .sam-btn-danger):not(:disabled):active'
    );
  });

  it("Biz buttons press and use gray disabled tokens", () => {
    const src = read("lib/ui/biz-component-classes.ts");
    expect(src).not.toContain("disabled:opacity-50");
    expect(src.match(/\[&:not\(:disabled\):active\]:scale-\[var\(--overlay-press-scale\)\]/g)?.length).toBe(3);
  });

  it("platform popup CTA has a press state", () => {
    expect(read("app/platform-popup.css")).toMatch(/\.dibay-promo-cta:not\(:disabled\):active\s*\{[^}]*scale/);
  });
});

describe("device verify fixes (2026-11-02)", () => {
  it("messenger bottom sheets have no bottom border line at the screen edge", () => {
    expect(read("components/community-messenger/MessengerSheetUi.tsx")).toContain(
      '"rounded-t-[length:var(--overlay-radius-xl)] border-b-0"'
    );
  });

  it("a lone overlay button (close/cancel outside a row) is full width", () => {
    expect(read("app/dibay-overlay.css")).toMatch(/\.dibay-overlay-btn\s*\{[^}]*width:\s*100%;[^}]*flex:\s*1;/);
  });
});

describe("messenger split view — every bottom sheet sits on the list pane (2026-11-02 tablet)", () => {
  it("shell adds the split-list class to fit-content and device-bottom panels, not to center popups", () => {
    const shell = read("components/community-messenger/MessengerSheetUi.tsx");
    /** 기본 켬(splitListPane = true) — 메신저 밖에서 쓰는 시트만 끈다 (내정보 QR 코드 시트, 2026-11-12) */
    expect(shell).toContain("splitListPane = true,");
    expect(shell).toContain('`${MESSENGER_HOME_BOTTOM_SHEET_PANEL_CLASS}${splitListPane ? ` ${MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS}` : ` ${OUTSIDE_MESSENGER_SHEET_WIDTH_CLASS}`}`');
    expect(shell).toContain('`${MESSENGER_HOME_BOTTOM_SHEET_DEVICE_BOTTOM_CLASS}${splitListPane ? ` ${MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS}` : ` ${OUTSIDE_MESSENGER_SHEET_WIDTH_CLASS}`}`');
    /** 메신저 밖 = 공용 오버레이 시트와 같은 폭(최대 32rem·가운데) */
    expect(shell).toContain('const OUTSIDE_MESSENGER_SHEET_WIDTH_CLASS = "mx-auto max-w-[32rem]";');
    expect(read("app/dibay-overlay.css")).toMatch(/\.dibay-overlay-sheet \{[^}]*max-width: 32rem;/);
  });

  it("≥768 width rule covers both panel kinds", () => {
    const css = read("app/messenger-home-bottom-sheet.css");
    expect(
      css.match(
        /:is\(\.messenger-home-bottom-sheet-panel, \.messenger-home-bottom-sheet-panel--device-bottom\)\.messenger-home-bottom-sheet-panel--split-list/g
      )?.length
    ).toBe(3);
  });
});
