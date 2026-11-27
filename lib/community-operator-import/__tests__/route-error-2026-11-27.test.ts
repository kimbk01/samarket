/**
 * 관리자 외부 글 가져오기 — 오류 코드·진단 원문 분리 (언어 재감사 2026-11-27 꼬리 정리 9번).
 */
import { describe, expect, it } from "vitest";
import { importRouteErrorDetail, importRouteErrorParts } from "@/lib/community-operator-import/route-error";
import { importErrorText } from "@/components/admin/community/external-import/api";
import { translate } from "@/lib/i18n/messages";

describe("importRouteErrorParts", () => {
  it("「코드: 원문」 → 코드 + detail", () => {
    expect(importRouteErrorParts(new Error("rules_load_failed: relation does not exist"), "rule_failed")).toEqual({
      code: "rules_load_failed",
      detail: "rules_load_failed: relation does not exist",
    });
  });
  it("코드만 → detail 없음", () => {
    expect(importRouteErrorParts(new Error("job_not_found"), "job_failed")).toEqual({ code: "job_not_found", detail: null });
  });
  it("코드 모양이 아니면 대체 코드 + 원문 detail", () => {
    expect(importRouteErrorParts(new Error("duplicate key value violates"), "job_failed")).toEqual({
      code: "job_failed",
      detail: "duplicate key value violates",
    });
    expect(importRouteErrorParts(null, "job_failed")).toEqual({ code: "job_failed", detail: null });
  });
  it("정해진 코드 + 원문", () => {
    expect(importRouteErrorDetail(new Error("timeout"), "inbox_failed")).toBe("timeout");
    expect(importRouteErrorDetail(new Error("inbox_failed"), "inbox_failed")).toBeNull();
  });
});

describe("importErrorText — 키 문구 (detail)", () => {
  it("게시 코드 → 키 문구, 진단 원문은 괄호", () => {
    const err = Object.assign(new Error("quality_failed"), { code: "quality_failed", detail: "FAILED: empty_body" });
    expect(importErrorText(err)).toBe(
      `${translate("ko", "admin_community_import_err_quality_failed")} (FAILED: empty_body)`
    );
  });
  it("detail 없으면 키 문구만", () => {
    const err = Object.assign(new Error("board_not_found"), { code: "board_not_found" });
    expect(importErrorText(err)).toBe(translate("ko", "admin_community_import_err_board_not_found"));
  });
  it("새 키는 영어에 한글 0", () => {
    for (const key of [
      "admin_community_import_err_quality_failed",
      "admin_community_import_err_quality_partial",
      "admin_community_import_err_board_not_found",
      "admin_community_import_err_invalid_topic",
      "admin_community_import_err_principal_missing",
      "admin_community_import_err_section_missing",
      "admin_community_import_err_image_ingest_failed",
      "admin_community_import_err_readback_failed",
    ] as const) {
      expect(translate("en", key)).not.toMatch(/[가-힣]/);
      expect(translate("ko", key)).toMatch(/[가-힣]/);
    }
  });
});
