/**
 * 관심이웃 실기 결함 2건 (2026-11-28 13:03 PHT · Xiaomi 1.2.8(87)·Samsung 1.2.8(88) · 운영 174d1dc) — 근본 수정 시험.
 * F2 관리 화면 제목이 「관심이웃」 — 제목·뒤로는 경로로 정해지는데 같은 경로에 주소 값만 붙였다 → 관리 화면을 자기 경로 항목으로.
 * F1 글 카드가 화면 밖으로 넘침 — 피드 표준 목록 틀 대신 새 격자를 만들었다 → 피드와 같은 틀.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MYPAGE_IA_CATEGORIES,
  resolveMypageIaParentHref,
  resolveMypageIaTitleKey,
} from "@/lib/mypage/mypage-ia";
import { findMypageMobileItem } from "@/lib/mypage/mypage-mobile-nav-registry";
import { isMypageItemWithoutHubWait } from "@/lib/mypage/mypage-item-hub-wait";
import { NEIGHBOR_FOLLOW_MANAGE_HREF, NEIGHBOR_FOLLOW_MYPAGE_HREF } from "@/lib/community/neighbor-follow-contract";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";

describe("F2 관리 화면 = 자기 경로 내정보 항목", () => {
  it("머리줄 제목 = 「관심이웃 관리」, 보기 화면 = 「관심이웃」 (경로별 분류 제목)", () => {
    const manageKey = resolveMypageIaTitleKey(NEIGHBOR_FOLLOW_MANAGE_HREF);
    expect(manageKey && translate("ko", manageKey)).toBe("관심이웃 관리");
    const viewKey = resolveMypageIaTitleKey(NEIGHBOR_FOLLOW_MYPAGE_HREF);
    expect(viewKey && translate("ko", viewKey)).toBe("관심이웃");
    /** 첫 구현(같은 경로 + ?manage=1)은 경로가 같아 제목도 같았다 */
    expect(resolveMypageIaTitleKey(`${NEIGHBOR_FOLLOW_MYPAGE_HREF}?manage=1`)).toBe(viewKey);
  });

  it("앱 1단 머리줄 첫 프레임 제목도 「관심이웃 관리」 (resolveMainTier1Subpage)", () => {
    const r = resolveMainTier1Subpage(NEIGHBOR_FOLLOW_MANAGE_HREF);
    expect(r && translate("ko", r.titleText as MessageKey)).toBe("관심이웃 관리");
  });

  it("관리 화면 뒤로(직접 진입) = 관심이웃 · 항목 등록 · 데이터 대기 없음", () => {
    expect(resolveMypageIaParentHref(NEIGHBOR_FOLLOW_MANAGE_HREF)).toBe(NEIGHBOR_FOLLOW_MYPAGE_HREF);
    expect(findMypageMobileItem("community", "community-friends-manage")).toBeTruthy();
    expect(isMypageItemWithoutHubWait("community", "community-friends-manage")).toBe(true);
  });

  it("내정보 분류 메뉴에는 관리 행이 없다 (관심이웃 화면 [관리]로만 진입)", () => {
    const hrefs = MYPAGE_IA_CATEGORIES.flatMap((c) => c.groups.flatMap((g) => g.rows))
      .map((r) => ("href" in r ? r.href : ""))
      .filter(Boolean);
    expect(hrefs).toContain(NEIGHBOR_FOLLOW_MYPAGE_HREF);
    expect(hrefs).not.toContain(NEIGHBOR_FOLLOW_MANAGE_HREF);
  });

  it("[완료] = 경로 기준 뒤로(Navigation API 없으면 기록 뒤로) — 기록 중복 방지 (구조 확인)", () => {
    const src = readFileSync(path.join(process.cwd(), "components/mypage/community/NeighborFollowHeaderAction.tsx"), "utf8");
    expect(src).toContain("runPathSettleBack(router, NEIGHBOR_FOLLOW_MYPAGE_HREF)");
  });

  it("주소 값 관리 모드 잔재 없음 (구조 확인)", () => {
    for (const f of [
      "components/mypage/community/NeighborFollowScreen.tsx",
      "components/mypage/community/NeighborFollowHeaderAction.tsx",
      "components/mypage/MyPageItemRouteClient.tsx",
    ]) {
      const src = readFileSync(path.join(process.cwd(), f), "utf8");
      expect(src, f).not.toMatch(/get\("manage"\)|\?manage=1`/);
    }
  });
});

describe("F1 글 목록 = 피드 표준 목록 틀 (구조 확인)", () => {
  it("COMMUNITY_FEED_GRID_WRAP_CLASS · data-feed-grid-item · 같은 카드", () => {
    const s = readFileSync(path.join(process.cwd(), "components/mypage/community/NeighborFollowScreen.tsx"), "utf8");
    expect(s).toContain("className={`${COMMUNITY_FEED_GRID_WRAP_CLASS} md:px-5`}");
    expect(s).toContain('data-feed-grid-item=""');
    expect(s).toContain("<CommunityCard post={p}");
  });
});
