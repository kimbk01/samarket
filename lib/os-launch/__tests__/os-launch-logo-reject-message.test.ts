/**
 * OS 시작 화면 로고 거부 사유 — 검사 코드마다 화면 전용 문구가 나오고 일반 실패 문구로 떨어지지 않는다.
 * (2026-11-13: 투명 배경 없는 PNG 가 `no_alpha` 로 거부됐는데 「처리를 완료하지 못했습니다」만 보임)
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 (실제 화면은 AdminShell 이 등록)
import { describe, expect, it } from "vitest";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { translate } from "@/lib/i18n/messages";
import { checkOsLaunchLogo } from "../contract";

const CODES = ["no_alpha", "not_png", "too_small", "too_big_dimensions", "too_large", "empty"] as const;

describe("OS 시작 화면 로고 거부 문구", () => {
  it("검사 코드마다 ko·en 전용 문구", () => {
    const generic = [translate("ko", "admin_operator_ux_generic_failure"), translate("en", "admin_operator_ux_generic_failure")];
    for (const code of CODES) {
      for (const ko of [true, false]) {
        const msg = adminOperatorErrorMessage(`os_launch_logo_${code}`, ko);
        expect(msg).toBe(translate(ko ? "ko" : "en", `admin_os_launch_err_${code}`));
        expect(msg.length).toBeGreaterThan(5);
        expect(generic).not.toContain(msg);
      }
    }
  });

  it("투명 없는 RGB PNG → no_alpha → 투명 PNG 안내", () => {
    // 1254×1254 RGB(color type 2) IHDR 만 있는 PNG 머리
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    b.set([0, 0, 0x04, 0xe6, 0, 0, 0x04, 0xe6, 8, 2], 16);
    const check = checkOsLaunchLogo(b);
    expect(check).toEqual({ ok: false, error: "no_alpha" });
    expect(adminOperatorErrorMessage("os_launch_logo_no_alpha", true)).toContain("투명");
  });
});
