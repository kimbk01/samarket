/**
 * v4 W1 API-10~12 — 고정 오류 코드 응답 헬퍼: 원문은 서버 로그로만.
 */
import { describe, expect, it, vi } from "vitest";
import {
  clientSafeErrorDetail,
  internalErrorLogMessage,
  internalErrorResponse,
} from "@/lib/security/internal-error-response";

const RAW = 'duplicate key value violates unique constraint "secret_idx" on table private.x';

describe("internalErrorResponse", () => {
  it("응답 = { ok:false, error: 고정 코드 }, 원문은 console.error 로만", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = internalErrorResponse("save_failed", "[t]", { message: RAW });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: "save_failed" });
    expect(text).not.toContain("secret_idx");
    expect(spy).toHaveBeenCalledWith("[t]", "save_failed", RAW);
    spy.mockRestore();
  });

  it("status 지정 가능", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(internalErrorResponse("x", "[t]", "e", 503).status).toBe(503);
  });

  it("로그 메시지 추출: Error·문자열·Postgrest 형태·null", () => {
    expect(internalErrorLogMessage(new Error("a"))).toBe("a");
    expect(internalErrorLogMessage("b")).toBe("b");
    expect(internalErrorLogMessage({ message: "c" })).toBe("c");
    expect(internalErrorLogMessage(null)).toBe("");
  });
});

describe("clientSafeErrorDetail", () => {
  it("5xx 또는 내부 오류 코드면 detail 제거", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(clientSafeErrorDetail("db_error", RAW, 400)).toBeUndefined();
    expect(clientSafeErrorDetail("capacity_full", RAW, 500)).toBeUndefined();
    expect(clientSafeErrorDetail("rpc_failed", RAW, 409)).toBeUndefined();
  });

  it("4xx 업무 안내 detail 은 유지", () => {
    expect(clientSafeErrorDetail("invalid_product", "First-party campaigns use ADMIN_FREE_COMPENSATION only.", 400)).toBe(
      "First-party campaigns use ADMIN_FREE_COMPENSATION only."
    );
    expect(clientSafeErrorDetail("x", null, 400)).toBeUndefined();
  });
});
