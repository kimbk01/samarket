import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * F2 2026-11-27 — 글 사진 올리기가 가입 진행 중 거절(403 signup_incomplete)되면
 * 올리기 도우미는 「가입 이어하기」 창과 같은 문장·사유를 돌려준다 (설계 C2 §5-3: 창과 다른 「올리기 실패」 금지).
 */
vi.mock("@/lib/i18n/runtime-app-language", () => ({ getRuntimeAppLanguage: () => "ko" }));

import { registrationGuidanceMessage } from "@/lib/auth/registration-guidance-fetch-gate.client";
import {
  isRegistrationRequiredUploadFailure,
  uploadPostImagesDetailed,
} from "@/lib/posts/uploadPostImages";
import { uploadCommunityImageFile } from "@/lib/philife/client-image-resize";
import { communityImageUploadErrorKey } from "@/lib/philife/community-image-upload-error";

const guidance403 = () =>
  new Response(
    JSON.stringify({ ok: false, code: "signup_incomplete", step: "phone", error: "가입 안내 문장" }),
    { status: 403, headers: { "content-type": "application/json" } },
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("F2 — 사진 올리기 가입 거절 문구", () => {
  it("거래 사진: 사유 registration_required · 창과 같은 문장", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => guidance403()));
    const file = new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" });
    const results = await uploadPostImagesDetailed([file], async (f) => ({ ok: true as const, file: f, resized: false }));
    expect(results[0]).toEqual({ ok: false, reason: "registration_required", message: registrationGuidanceMessage() });
    expect(isRegistrationRequiredUploadFailure(results)).toBe(true);
  });

  it("거래 사진: 다른 서버 실패는 가입 거절로 보지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "x" }), { status: 500 })),
    );
    const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    const results = await uploadPostImagesDetailed([file], async (f) => ({ ok: true as const, file: f, resized: false }));
    expect(results[0]).toMatchObject({ ok: false, reason: "server" });
    expect(isRegistrationRequiredUploadFailure(results)).toBe(false);
  });

  it("필라이프·모임 사진: 고정 「올리기 실패」 대신 창과 같은 문장 + code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => guidance403()));
    const file = new File([new Uint8Array([1, 2, 3])], "a.gif", { type: "image/gif" });
    const r = await uploadCommunityImageFile("/api/philife/upload-image", file, {
      network: "network",
      tooLarge: "tooLarge",
      failed: "failed",
    });
    expect(r).toEqual({ ok: false, error: registrationGuidanceMessage(), code: "signup_incomplete" });
  });

  it("필라이프 붙여넣기 사진 오류 코드 → 창과 같은 문구 키", () => {
    expect(communityImageUploadErrorKey("signup_incomplete", 403)).toBe("auth_reg_gate_title");
  });
});
