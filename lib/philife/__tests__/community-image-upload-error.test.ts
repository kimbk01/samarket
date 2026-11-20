// @vitest-environment jsdom
/**
 * 감사 docs/audit/lounge-paste-images-2026-11-20.md §11 R4 — 업로드 오류는 서버 코드 → 화면 언어 문구.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { communityImageUploadErrorKey, isCommunityPostImageErrorCode } from "@/lib/philife/community-image-upload-error";
import { uploadCommunityImageFile } from "@/lib/philife/client-image-resize";
import { translate } from "@/lib/i18n/messages";

afterEach(() => vi.unstubAllGlobals());

describe("오류 코드 → 문구 키", () => {
  it("업로드·가져오기·저장 코드가 모두 ko·en 문구를 가진다", () => {
    const codes = ["too_large", "unsupported_type", "not_image", "url_not_allowed", "fetch_failed", "upload_rate_limited", "image_not_allowed", "too_many_images", "server_config", undefined];
    for (const c of codes) {
      const key = communityImageUploadErrorKey(c);
      for (const lang of ["ko", "en"] as const) {
        const text = translate(lang, key, { max: "30" });
        expect(text, `${String(c)} ${lang}`).toBeTruthy();
        expect(text).not.toBe(key);
      }
    }
    expect(communityImageUploadErrorKey("nope", 413)).toBe("philife_write_err_image_too_large");
    expect(isCommunityPostImageErrorCode("too_many_images")).toBe(true);
    expect(isCommunityPostImageErrorCode("rate_limited")).toBe(false);
  });

  it("영어 상한 문구에 30장이 들어간다", () => {
    expect(translate("en", "philife_write_err_image_limit", { max: "30" })).toBe("You can add up to 30 photos.");
    expect(translate("ko", "philife_write_err_image_limit", { max: "30" })).toBe("사진은 30장까지 올릴 수 있습니다.");
  });
});

describe("uploadCommunityImageFile — 서버 문구 대신 코드 문구", () => {
  it("code 가 있으면 byCode 문구, 서버 error 문구는 쓰지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "unsupported_type", error: "서버 한국어" }), { status: 400 })));
    const f = new File([new Uint8Array([71, 73, 70])], "a.gif", { type: "image/gif" });
    const r = await uploadCommunityImageFile("/x", f, {
      network: "net",
      tooLarge: "big",
      failed: "fail",
      byCode: (code) => `mapped:${code}`,
    });
    expect(r).toEqual({ ok: false, error: "mapped:unsupported_type", code: "unsupported_type" });
  });

  it("byCode 없는 호출부(모임)는 코드가 too_large 면 tooLarge, 그 밖은 failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "too_large" }), { status: 413 })));
    const f = new File([new Uint8Array([71, 73, 70])], "a.gif", { type: "image/gif" });
    const r = await uploadCommunityImageFile("/x", f, { network: "net", tooLarge: "big", failed: "fail" });
    expect(r).toMatchObject({ ok: false, error: "big" });
  });
});

describe("업로드 API 는 한국어 문구 대신 code 만 돌려준다", () => {
  it.each(["app/api/community/upload-image/route.ts", "app/api/community/upload-image-from-url/route.ts"])("%s", (p) => {
    const src = readFileSync(p, "utf8");
    expect(src).not.toMatch(/ok: false, error:/);
    const codeLines = src.split("\n").filter((l) => /NextResponse\.json\(\s*\{?\s*ok: false/.test(l) || /\{ ok: false, code:/.test(l));
    expect(codeLines.length).toBeGreaterThan(0);
  });
});
