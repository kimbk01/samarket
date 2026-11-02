/**
 * 내정보 1단 제목 첫 프레임 계약 (설계서 §2 제목 · §12 「제목 시점」).
 *
 * - `app/(main)/mypage/**\/page.tsx` 가 렌더하는 모든 경로는 `resolveMainTier1Subpage` 에서
 *   비어 있지 않은 제목을 가진다 (페이지 등록 전 첫 프레임 = 최종 제목, 빈 제목 → 「내용을 표시할 수 없습니다」 금지).
 * - 페이지가 `MyScreen`·`MySubpageHeader` 로 등록하는 제목 키를 소스에서 읽을 수 있으면 경로 표와 같아야 한다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import { getMobileTopTier1RuleSet } from "@/lib/layout/mobile-top-tier1-rules";
import { resolveMainTabKeepAliveHub } from "@/lib/layout/resolve-main-surface";
import { MYPAGE_MOBILE_NAV } from "@/lib/mypage/mypage-mobile-nav-registry";
import { MYPAGE_IA_CATEGORIES, resolveMypageIaTitleKey } from "@/lib/mypage/mypage-ia";
import { resolveMypageSectionLegacyHubRedirect } from "@/lib/mypage/mypage-section-legacy-redirect";
import { looksLikeMessageKey } from "@/lib/i18n/safe-ui-label";
import { translate, type MessageKey } from "@/lib/i18n/messages";

const ROOT = process.cwd();
const MYPAGE_APP_DIR = join(ROOT, "app", "(main)", "mypage");

function listPageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listPageFiles(full));
    else if (name === "page.tsx") out.push(full);
  }
  return out;
}

/** 모든 실행 경로가 `redirect()` 인 레거시 별칭 페이지 (JSX 를 그리지 않음) */
function isRedirectOnlyPage(src: string): boolean {
  return /\bredirect\(/.test(src) && !/return\s*\(?\s*</.test(src) && !/=>\s*\(?\s*</.test(src);
}

/** `app/(main)/mypage/a/[id]/page.tsx` → 대표 경로들 */
function expandRoutes(file: string): string[] {
  const rel = relative(MYPAGE_APP_DIR, file).split(sep).slice(0, -1);
  const segs = ["/mypage", ...rel.map((s) => `/${s}`)].join("");
  if (segs === "/mypage/section/[section]") {
    return MYPAGE_MOBILE_NAV.map((s) => `/mypage/section/${s.id}`);
  }
  if (segs === "/mypage/section/[section]/[item]") {
    return MYPAGE_MOBILE_NAV.flatMap((s) =>
      s.items
        .filter((it) => !resolveMypageSectionLegacyHubRedirect(s.id, it.id))
        .filter((it) => !(s.id === "store" && it.id === "manage"))
        .map((it) => `/mypage/section/${s.id}/${it.id}`),
    );
  }
  if (segs === "/mypage/section/[section]/[item]/edit") {
    return ["/mypage/section/account/profile/edit"];
  }
  return [segs.replace(/\[[^\]]+\]/g, "x1")];
}

function renderedMypageRoutes(): { route: string; file: string }[] {
  return listPageFiles(MYPAGE_APP_DIR)
    .filter((f) => !isRedirectOnlyPage(readFileSync(f, "utf8")))
    .flatMap((file) => expandRoutes(file).map((route) => ({ route, file })));
}

function resolvedTitleLabel(route: string): string {
  const r = resolveMainTier1Subpage(route);
  const raw = r?.titleText?.trim() ?? "";
  if (!raw) return "";
  return looksLikeMessageKey(raw) ? translate("ko", raw as MessageKey) : raw;
}

/**
 * 페이지 소스 → 등록 제목 키 (결정 가능한 경우만).
 * route → 제목을 등록하는 파일(페이지 자체가 아니라 클라이언트 컴포넌트일 때).
 */
const TITLE_SOURCE_FILES: Readonly<Record<string, string>> = {
  "/mypage/addresses/search": "components/addresses/AddressPlatformSearchClient.tsx",
  "/mypage/ads": "app/(main)/mypage/ads/MyAdsPageClient.tsx",
  "/mypage/ads/apply": "app/(main)/mypage/ads/apply/MyAdsApplyPageClient.tsx",
  "/mypage/community-activity": "components/mypage/community-activity/MypageCommunityActivityChrome.tsx",
  "/mypage/community-posts": "components/mypage/community/MypageCommunityPostsChrome.tsx",
  "/mypage/customer-center": "components/mypage/cs/CustomerCenterHubClient.tsx",
  "/mypage/offers": "components/offers/MyOffersTabsScreen.tsx",
  "/mypage/products": "components/mypage/products/MyProductsPageClient.tsx",
  "/mypage/recent-viewed": "components/recent-viewed/RecentViewedList.tsx",
  "/mypage/support-history": "components/support/MemberSupportHistoryClient.tsx",
  "/mypage/trust": "components/mypage/trust/MypageTrustContent.tsx",
};

const HEADER_TITLE_RE =
  /<(?:MyScreen|MySubpageHeader|MypageSubpageShell)\b[^>]*?(?:titleKey=["{]?"?([a-z][a-z0-9_]+)|title=\{(?:t|safeT)\("([a-z][a-z0-9_]+)")/;

function registeredTitleKey(route: string, pageFile: string): string | null {
  const srcFile = TITLE_SOURCE_FILES[route] ? join(ROOT, TITLE_SOURCE_FILES[route]!) : pageFile;
  const m = HEADER_TITLE_RE.exec(readFileSync(srcFile, "utf8"));
  return m ? (m[1] ?? m[2] ?? null) : null;
}

describe("mypage tier1 first-frame titles", () => {
  const routes = renderedMypageRoutes();

  it("enumerates rendered mypage routes (section items expanded)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(60);
    expect(routes.map((r) => r.route)).toContain("/mypage/section/settings/notifications");
  });

  it("every rendered mypage route resolves a non-empty title in the route table", () => {
    const missing: string[] = [];
    for (const { route } of routes) {
      if (resolveMainTabKeepAliveHub(route) === "mypage") continue;
      if (!getMobileTopTier1RuleSet(route).showRegionBar) continue;
      if (!resolvedTitleLabel(route)) missing.push(route);
    }
    expect(missing).toEqual([]);
  });

  it("route table title equals the page-registered title key where determinable", () => {
    const mismatched: string[] = [];
    let compared = 0;
    for (const { route, file } of routes) {
      if (!getMobileTopTier1RuleSet(route).showRegionBar) continue;
      /** 분류(IA) L2 화면 = 헤더가 분류 행 이름으로 덮는다 (`MySubpageHeader` → `resolveMypageIaTitleKey`) */
      const key = resolveMypageIaTitleKey(route) ?? registeredTitleKey(route, file);
      if (!key) continue;
      compared += 1;
      const resolved = resolveMainTier1Subpage(route)?.titleText ?? "";
      if (resolved !== key) mismatched.push(`${route}: page=${key} table=${resolved}`);
    }
    expect(compared).toBeGreaterThanOrEqual(20);
    expect(mismatched).toEqual([]);
  });

  it("분류 화면 제목 = 분류 이름 · 뒤로 홈, 분류 행 화면 제목 = 행 이름 · 뒤로 그 분류 (IA 2026-11-02)", () => {
    for (const cat of MYPAGE_IA_CATEGORIES) {
      const l1 = resolveMainTier1Subpage(`/mypage/section/${cat.id}`);
      expect(l1?.titleText).toBe(cat.titleKey);
      expect(l1?.backHref).toBe("/mypage");
      for (const g of cat.groups) {
        for (const row of g.rows) {
          if (!("href" in row) || !row.href.startsWith("/mypage/")) continue;
          const r = resolveMainTier1Subpage(row.href);
          expect(r?.titleText, row.href).toBe(row.titleKey);
          expect(r?.backHref, row.href).toBe(`/mypage/section/${cat.id}`);
        }
      }
    }
  });

  it("분류에 없는 섹션 항목은 레지스트리 라벨 · 뒤로 = 같은 이름 분류(없으면 홈)", () => {
    for (const section of MYPAGE_MOBILE_NAV) {
      for (const item of section.items) {
        if (resolveMypageSectionLegacyHubRedirect(section.id, item.id)) continue;
        const path = `/mypage/section/${section.id}/${item.id}`;
        if (resolveMypageIaTitleKey(path)) continue;
        const r = resolveMainTier1Subpage(path);
        expect(r?.titleText, path).toBe(item.labelKey);
      }
    }
  });

  it("registers /privacy and /business-info titles", () => {
    expect(resolvedTitleLabel("/privacy")).toBe("개인정보처리방침");
    expect(resolvedTitleLabel("/business-info")).toBe("사업자 정보");
  });

  it("business-info page has no duplicate h1 of the header title", () => {
    const src = readFileSync(join(ROOT, "app/(main)/business-info/BusinessInfoPageClient.tsx"), "utf8");
    expect(src).not.toMatch(/<h1\b/);
  });
});
