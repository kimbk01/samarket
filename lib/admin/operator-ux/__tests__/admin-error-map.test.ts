import { describe, expect, it } from "vitest";
import {
  adminHttpStatusErrorMessage,
  adminOperatorErrorMessage,
  isAdminOperatorSentence,
  isAdminUnmappedError,
} from "@/lib/admin/operator-ux/operator-labels";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";

const GENERIC = "처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";

describe("오류 맵 (수정 계획 2-5) — 원문 노출 금지", () => {
  it("아는 코드는 정해진 문구", () => {
    expect(adminOperatorErrorMessage("forbidden", true)).toBe("이 작업을 할 권한이 없습니다.");
    expect(adminOperatorErrorMessage("store_not_found", true)).toBe("매장을 찾을 수 없습니다.");
  });

  it("DB·런타임 원문은 일반 실패 문구로 바뀐다", () => {
    expect(adminOperatorErrorMessage('duplicate key value violates unique constraint "x_pkey"', true)).toBe(GENERIC);
    expect(adminOperatorErrorMessage('relation "public.foo" does not exist', true)).toBe(GENERIC);
    expect(adminOperatorErrorMessage("처리하지 못했습니다: relation \"foo\" does not exist", true)).toBe(GENERIC);
    expect(adminOperatorErrorMessage("some_unknown_code", true)).toBe(GENERIC);
  });

  it("네트워크 실패 원문은 네트워크 문구", () => {
    expect(adminOperatorErrorMessage("TypeError: Failed to fetch", true)).toContain("네트워크");
  });

  it("운영자용 한글 문장은 그대로", () => {
    const s = "이미 처리된 신청입니다. 목록을 새로고침하세요.";
    expect(isAdminOperatorSentence(s)).toBe(true);
    expect(adminOperatorErrorMessage(s, true)).toBe(s);
    expect(isAdminUnmappedError(s)).toBe(false);
  });

  it("HTTP 상태별 고정 문구 (401·403·404·409·422·429·5xx)", () => {
    for (const st of [401, 403, 404, 409, 422, 429, 500]) {
      expect(adminHttpStatusErrorMessage(st, true)).not.toBe(GENERIC);
    }
    expect(adminHttpStatusErrorMessage(503, true)).toBe(adminHttpStatusErrorMessage(500, true));
    expect(adminOperatorErrorMessage("rate_limited", true)).toBe(adminHttpStatusErrorMessage(429, true));
  });

  it("모르는 코드·원문은 미매핑으로 판정", () => {
    expect(isAdminUnmappedError("some_unknown_code")).toBe(true);
    expect(isAdminUnmappedError("JWT expired")).toBe(true);
    expect(isAdminUnmappedError("forbidden")).toBe(false);
  });

  it("resolveAdminApiErrorMessage 도 원문을 내보내지 않는다", () => {
    const t = (k: string) => `t:${k}`;
    expect(resolveAdminApiErrorMessage("JWT expired", t as never)).toBe("t:common_error");
    expect(resolveAdminApiErrorMessage("not_found", t as never)).toBe("t:admin_api_err_not_found");
    expect(resolveAdminApiErrorMessage("이미 처리된 신청입니다.", t as never)).toBe("이미 처리된 신청입니다.");
  });
});
