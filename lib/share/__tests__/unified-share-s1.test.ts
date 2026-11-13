import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DIBAY_PRODUCTION_SITE_ORIGIN } from "@/lib/platform/capacitor-server-url";
import {
  buildSharePath,
  buildShareUrl,
  isProductionShareContext,
  resolveShareSiteOrigin,
} from "@/lib/share/share-url";
import {
  isCapacitorShareCancel,
  shareViaPlatform,
  type PlatformShareDeps,
} from "@/lib/share/platform-share";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("S1 Share URL Resolver (§D-2 · §I-5)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("운영 origin 만 — VERCEL_URL(배포별 주소)·localhost 무시", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_URL", "samarket-abc123-team.vercel.app");
    expect(resolveShareSiteOrigin()).toBe(DIBAY_PRODUCTION_SITE_ORIGIN);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(resolveShareSiteOrigin()).toBe(DIBAY_PRODUCTION_SITE_ORIGIN);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://samarket.vercel.app/");
    expect(resolveShareSiteOrigin()).toBe("https://samarket.vercel.app");
  });

  it("기존 상세 라우트만 쓴다 (새 URL 없음)", () => {
    expect(buildSharePath({ kind: "feed", postId: "p1" })).toBe("/community/posts/p1");
    expect(buildSharePath({ kind: "market", postId: "p1" })).toBe("/post/p1");
    expect(buildSharePath({ kind: "store", storeSlug: "seoul-bunsik" })).toBe("/stores/seoul-bunsik");
    expect(buildSharePath({ kind: "store_product", storeSlug: "s", productId: "m1" })).toBe("/stores/s/p/m1");
    expect(buildSharePath({ kind: "moim_invite", token: "tok" })).toBe("/moim/i/tok");
    expect(buildSharePath({ kind: "store", storeSlug: "  " })).toBeNull();
  });

  it("절대 주소 · 매장 링크에 현재 쿼리가 섞이지 않음 · FEED 만 기존 UTM", () => {
    const store = buildShareUrl({ kind: "store", storeSlug: "seoul-bunsik" })!;
    expect(store).toMatch(/^https:\/\/[^/]+\/stores\/seoul-bunsik$/);
    const feed = buildShareUrl({ kind: "feed", postId: "p1" })!;
    expect(feed).toContain("/community/posts/p1?");
    expect(feed).toContain("utm_source=dibay_share");
  });

  it("운영 주소 밖(로컬·과거 배포 주소)에서는 외부 공유 문맥이 아님", () => {
    expect(isProductionShareContext(DIBAY_PRODUCTION_SITE_ORIGIN)).toBe(true);
    expect(isProductionShareContext("http://localhost:3000")).toBe(false);
    expect(isProductionShareContext("https://samarket-git-feat-x-team.vercel.app")).toBe(false);
  });
});

function deps(over: Partial<PlatformShareDeps>): PlatformShareDeps {
  return { isNativeApp: () => false, nativeShare: vi.fn(), webShare: null, ...over };
}

describe("S1 Platform Share 결과 계약 (§I-1)", () => {
  const payload = { title: "T", url: "https://samarket.vercel.app/post/1" };

  it("앱: 취소 = cancelled · 선택 = handed_off · 오류 = failed · Web Share 로 넘어가지 않음", async () => {
    const webShare = vi.fn();
    const cancel = deps({ isNativeApp: () => true, nativeShare: vi.fn().mockRejectedValue(new Error("Share canceled")), webShare });
    expect(await shareViaPlatform(payload, cancel)).toBe("cancelled");
    const ok = deps({ isNativeApp: () => true, nativeShare: vi.fn().mockResolvedValue({ activityType: "com.kakao.talk" }), webShare });
    expect(await shareViaPlatform(payload, ok)).toBe("handed_off");
    const err = deps({ isNativeApp: () => true, nativeShare: vi.fn().mockRejectedValue(new Error("Error sharing item")), webShare });
    expect(await shareViaPlatform(payload, err)).toBe("failed");
    expect(webShare).not.toHaveBeenCalled();
  });

  it("웹: AbortError = cancelled · 그 밖 오류 = failed · 미지원 = unavailable", async () => {
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    expect(await shareViaPlatform(payload, deps({ webShare: vi.fn().mockRejectedValue(abort) }))).toBe("cancelled");
    const notAllowed = Object.assign(new Error("x"), { name: "NotAllowedError" });
    expect(await shareViaPlatform(payload, deps({ webShare: vi.fn().mockRejectedValue(notAllowed) }))).toBe("failed");
    expect(await shareViaPlatform(payload, deps({ webShare: vi.fn().mockResolvedValue(undefined) }))).toBe("handed_off");
    expect(await shareViaPlatform(payload, deps({ webShare: null }))).toBe("unavailable");
  });

  it("글만 공유(메시지) 허용 · url·글 둘 다 없으면 failed", async () => {
    const webShare = vi.fn().mockResolvedValue(undefined);
    expect(await shareViaPlatform({ title: "방", text: "안녕" }, deps({ webShare }))).toBe("handed_off");
    expect(await shareViaPlatform({ title: "방" }, deps({ webShare }))).toBe("failed");
  });

  it("Capacitor 취소 메시지 판별", () => {
    expect(isCapacitorShareCancel(new Error("Share canceled"))).toBe(true);
    expect(isCapacitorShareCancel("Share canceled")).toBe(true);
    expect(isCapacitorShareCancel(new Error("Error sharing item"))).toBe(false);
  });

  it("기기 공유 모듈은 클립보드를 건드리지 않는다 (실패·취소 시 자동 복사 금지)", () => {
    const src = read("lib/share/platform-share.ts");
    expect(src).not.toMatch(/navigator\.clipboard|execCommand|copyShareLink/);
  });
});

describe("S3 적용 — 자동 복사 경로 제거", () => {
  it("공통 시트·매장·메뉴·CREW·메시지 외부 공유는 실패 시 복사하지 않는다", () => {
    for (const rel of [
      "components/share/DibayShareSheet.tsx",
      "components/stores/StoreDetailPublic.tsx",
      "components/stores/StoreDetailStickyTopRow.tsx",
      "components/stores/StoreProductPublic.tsx",
      "components/moim/MoimInviteSheet.tsx",
      "components/moim/manage/MoimManageInvite.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toContain("navigator.share(");
      expect(src, rel).not.toContain("store_link_copied");
    }
    const ctrl = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    const ext = ctrl.slice(ctrl.indexOf("const shareMessageExternally"), ctrl.indexOf("const shareMessageCopyDeepLink"));
    expect(ext).toContain("shareViaPlatform");
    expect(ext).not.toContain("clipboard");
  });

  it("MARKET 상세 공유도 통합 시트 (Owner 2026-11-14 「CUT G 열고 통합」)", () => {
    const src = read("components/post/PostDetailView.tsx");
    expect(src).toContain("DibayShareSheet");
    expect(src).not.toContain("shareOrCopyTradeListing");
  });
});

describe("S4 링크 미리보기 — 공개 필드만 · 추가 DB 조회 없음", () => {
  // trade-post-metadata 는 `next` 타입을 쓰므로 테스트 프로젝트(tsconfig.test)에 끌어오지 않고 소스로 확인한다.
  it("MARKET 미리보기 = 제목·가격·동네·대표 사진·정규 주소, 판매자·전화 정보 없음", () => {
    const src = read("lib/share/trade-post-metadata.ts");
    expect(src).toContain('buildShareUrl({ kind: "market", postId: item.id })');
    expect(src).not.toMatch(/phone|seller|author|nickname/i);
  });

  it("상세 데이터는 React cache 로 본문·미리보기가 1회 공유", () => {
    const post = read("app/(main)/post/[id]/page.tsx");
    expect(post).toContain("const loadPostDetailForRequest = cache(");
    expect(post.match(/getItemDetailPageData\(/g)?.length).toBe(1);
    const philife = read("app/(main)/philife/[postId]/page.tsx");
    expect(philife).toContain("const loadPhilifePostForRequest = cache(");
    expect(philife.match(/getNeighborhoodPostDetail\(/g)?.length).toBe(1);
  });
});
