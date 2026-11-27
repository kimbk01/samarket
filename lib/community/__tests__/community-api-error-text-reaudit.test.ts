import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { ApiErrorTranslate } from "@/lib/i18n/api-error-text";
import {
  COMMUNITY_COMMENT_ERROR_KEYS,
  COMMUNITY_FEED_ERROR_KEYS,
  COMMUNITY_OG_IMAGE_ERROR_KEYS,
  COMMUNITY_POST_DELETE_ERROR_KEYS,
  COMMUNITY_POST_WRITE_ERROR_KEYS,
  communityApiErrorText,
} from "@/lib/community/community-api-error-text";
import { communityAcceptanceErrorCode } from "@/lib/community-points/content-acceptance";
import { COMMUNITY_PUBLIC_REGION_FALLBACK } from "@/lib/addresses/community-public-region-label";
import {
  communityAuthorNameText,
  communityRegionLabelText,
  localizeImportedLinkText,
  localizeImportedPostBody,
} from "@/lib/community/community-display-fallbacks";

const HANGUL = /[가-힣]/;
const tFor = (lang: AppLanguageCode): ApiErrorTranslate => (key, vars) => translate(lang, key, vars);

const MAPS = {
  og: COMMUNITY_OG_IMAGE_ERROR_KEYS,
  write: COMMUNITY_POST_WRITE_ERROR_KEYS,
  del: COMMUNITY_POST_DELETE_ERROR_KEYS,
  comment: COMMUNITY_COMMENT_ERROR_KEYS,
  feed: COMMUNITY_FEED_ERROR_KEYS,
};

describe("필라이프 API 오류 코드 → 화면 문구 (재감사 2026-11-27)", () => {
  for (const [name, map] of Object.entries(MAPS)) {
    it(`${name}: 영어 결과에 한글 0, 한국어 결과에 서버 영어 코드 0`, () => {
      for (const code of Object.keys(map)) {
        const json = { ok: false, error: code, code, params: { max: 30, sec: 10 } };
        const en = communityApiErrorText({ json, status: 400 }, map, "community_comment_action_failed", tFor("en"));
        const ko = communityApiErrorText({ json, status: 400 }, map, "community_comment_action_failed", tFor("ko"));
        expect(en, `${name}.${code}`).not.toMatch(HANGUL);
        expect(en).not.toContain("{");
        expect(ko, `${name}.${code}`).toMatch(HANGUL);
        expect(ko).not.toContain(code);
      }
    });
  }

  it("값(params)은 문구에 들어간다", () => {
    const json = { ok: false, error: "title_too_long", code: "title_too_long", params: { max: 40 } };
    expect(communityApiErrorText({ json, status: 400 }, COMMUNITY_POST_WRITE_ERROR_KEYS, "philife_write_err_register_failed", tFor("en"))).toContain("40");
    const c = { ok: false, error: "comment_interval", code: "comment_interval", params: { sec: 15 } };
    expect(communityApiErrorText({ json: c, status: 429 }, COMMUNITY_COMMENT_ERROR_KEYS, "community_comment_action_failed", tFor("ko"))).toContain("15");
  });

  it("서버 문장(옛 응답)은 화면에 나오지 않는다 — 기본 문구", () => {
    const json = { ok: false, error: "동네 정보를 저장하지 못했습니다. (permission denied for table locations)" };
    const en = communityApiErrorText({ json, status: 400 }, COMMUNITY_POST_WRITE_ERROR_KEYS, "philife_write_err_register_failed", tFor("en"));
    expect(en).toBe(translate("en", "philife_write_err_register_failed"));
  });

  it("내용 검사 코드는 표에 있다", () => {
    for (const c of ["empty", "punctuation_only", "repeated_only"] as const) {
      const code = communityAcceptanceErrorCode(c);
      expect(COMMUNITY_POST_WRITE_ERROR_KEYS[code]).toBeTruthy();
      expect(COMMUNITY_COMMENT_ERROR_KEYS[code]).toBeTruthy();
    }
  });
});

describe("필라이프 옛 저장 문장 → 화면 언어 (재감사 2026-11-27)", () => {
  it("저장 기본 지역 「동네」는 화면 언어 키로, 실제 지역 이름은 그대로", () => {
    expect(COMMUNITY_PUBLIC_REGION_FALLBACK).toBe(translate("ko", "community_local_filter_area_label"));
    expect(communityRegionLabelText(COMMUNITY_PUBLIC_REGION_FALLBACK, tFor("en"))).toBe("Neighborhood");
    expect(communityRegionLabelText(COMMUNITY_PUBLIC_REGION_FALLBACK, tFor("ko"))).toBe("동네");
    expect(communityRegionLabelText("Makati", tFor("en"))).toBe("Makati");
    expect(communityRegionLabelText(null, tFor("en"))).toBe("");
  });

  it("작성자 이름이 비면 화면 언어 「익명」", () => {
    expect(communityAuthorNameText("", tFor("en"))).toBe("Anonymous");
    expect(communityAuthorNameText("", tFor("ko"))).toBe("익명");
    expect(communityAuthorNameText("민수", tFor("en"))).toBe("민수");
  });

  it("옛 가져온 글 출처 줄·원문 링크만 안내를 영어 화면에서 영어로", () => {
    const t = tFor("en");
    const body = "첫 문장\n\n출처: 뉴스사이트 https://e.com/a/1";
    const out = localizeImportedPostBody(body, null, t);
    expect(out).toContain("Source: 뉴스사이트 https://e.com/a/1");
    expect(out).toContain("첫 문장");
    expect(localizeImportedPostBody("뉴스사이트에 게시된 글입니다. 아래 출처에서 원문을 확인하세요.", null, t)).toBe(
      "Posted on 뉴스사이트. See the original via the source below."
    );
    expect(localizeImportedLinkText("출처: 뉴스사이트", t)).toBe("Source: 뉴스사이트");
    expect(localizeImportedLinkText("원문 보기", t)).toBe("원문 보기");
  });

  it("새 「원문 링크만」 글(본문 = 원문 주소)은 안내 문구로", () => {
    const att = { sourceName: "S", canonicalUrl: "https://e.com/x" };
    expect(localizeImportedPostBody("https://e.com/x", att, tFor("en"))).toBe("Posted on S. See the original via the source below.");
    expect(localizeImportedPostBody("https://e.com/x", att, tFor("ko"))).toMatch(HANGUL);
  });
});

describe("가져온 영상 링크 — 저장 문구 없이 표식만 (재감사 2026-11-27)", () => {
  it("videoFromEmbed 는 「▶」 표식만 저장하고 화면은 영상 줄로 알아본다", async () => {
    const { videoFromEmbed } = await import("@/lib/community-operator-import/normalize");
    const { isImportedVideoLabel, splitPostTextWithVideos } = await import("@/lib/community/post-media-embed");
    const yt = videoFromEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ");
    const vm = videoFromEmbed("https://player.vimeo.com/video/123456");
    for (const v of [yt, vm]) {
      expect(v?.label).toBe("▶");
      expect(v!.label).not.toMatch(HANGUL);
      expect(isImportedVideoLabel(v!.label)).toBe(true);
      const [seg] = splitPostTextWithVideos(`${v!.label} ${v!.url}`);
      expect(seg).toMatchObject({ kind: "video", label: "▶" });
    }
  });
});

describe("E3 — 글 저장 사진 장수 한도는 서버 params.max 로 그린다 (언어 사후 검토)", () => {
  it("동네 글 등록·수정 route 가 params 를 함께 보낸다", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const rel of [
      "app/api/community/neighborhood-posts/route.ts",
      "app/api/community/neighborhood-posts/[postId]/route.ts",
    ]) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src, rel).toContain("params: imagesRes.params");
    }
  });

  it("too_many_images + params.max → 그 숫자로 화면 언어 문구", () => {
    const json = { ok: false, error: "too_many_images", code: "too_many_images", params: { max: 7 } };
    expect(communityApiErrorText({ json }, COMMUNITY_POST_WRITE_ERROR_KEYS, "philife_write_err_register_failed", tFor("en"))).toBe(
      translate("en", "philife_write_err_image_limit", { max: 7 })
    );
  });
});
