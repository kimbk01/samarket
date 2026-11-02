import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 크롬 S1 (2026-11-02) — 헤더 행 밖 자체 헤더의 뒤로 = 48×48 · ‹ 가운데 (opt-in `sector-header-back--touch`).
 * 배달 헤더 계약(Owner 2026-11-02 「배달 헤더 계약 파기 금지」)은 그대로 — 배달 파일은 이 클래스를 쓰지 않는다.
 * docs/audit/dibay-chrome-header-tab-bottomnav-audit-2026-11-02.md §1-3
 */
const ROOT = process.cwd();
const css = readFileSync(join(ROOT, "app/sector-header.css"), "utf8");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function ruleBody(selector: string): string {
  const idx = css.indexOf(`\n${selector} {`);
  expect(idx, `missing rule ${selector}`).toBeGreaterThan(-1);
  const start = css.indexOf("{", idx);
  return css.slice(start + 1, css.indexOf("\n}", start));
}

/** S2 에서 자체 헤더가 전역 1단/`DetailHeader` 로 바뀐 곳(이벤트·전체서비스·그룹방·카테고리·메신저 스택)은 `chrome-s2-header-unify` 테스트가 담당 */
const TOUCH_SITES = [
  "components/admin/AdminPageHeader.tsx",
  "components/chats/ChatDetailView.tsx",
  "components/community-messenger/MessengerSplitTopBar.tsx",
  "app/(main)/group-chat/GroupChatHomePageClient.tsx",
];

const DELIVERY_HEADER_FILES = [
  "components/stores/browse/StoresBrowseHeaderChrome.tsx",
  "components/stores/home/hub/StoresGreenFixedHeaderChrome.tsx",
  "components/stores/StoreDetailBackRow.tsx",
  "components/chats/StoreOrderBuyerChatTop.tsx",
  "components/business/owner/OwnerMobileAdminHeader.tsx",
  "components/business/owner/StoresOwnerStackHeader.tsx",
];

describe("back button — own-header touch target (chrome S1)", () => {
  it("default .sector-header-back geometry unchanged (delivery contract)", () => {
    const body = ruleBody(".sector-header-back");
    expect(body).toContain("width: var(--sector-header-back-size);");
    expect(body).toContain("justify-content: flex-start;");
  });

  it("opt-in touch class = 48×48, glyph centered", () => {
    const body = ruleBody(".sector-header-back.sector-header-back--touch");
    expect(body).toContain("width: var(--sector-header-touch);");
    expect(body).toContain("height: var(--sector-header-touch);");
    expect(body).toContain("justify-content: center;");
  });

  it("non-delivery own headers use the touch class", () => {
    for (const rel of TOUCH_SITES) {
      expect(read(rel), rel).toContain("sector-header-back--touch");
    }
  });

  it("store order chat keeps the delivery back geometry inside ChatDetailView", () => {
    expect(read("components/chats/ChatDetailView.tsx")).toContain(
      'className={isStoreOrderChat ? undefined : "sector-header-back--touch -ml-1.5"}'
    );
  });

  it("delivery headers do not opt in", () => {
    for (const rel of DELIVERY_HEADER_FILES) {
      expect(read(rel), rel).not.toContain("sector-header-back--touch");
    }
  });
});
