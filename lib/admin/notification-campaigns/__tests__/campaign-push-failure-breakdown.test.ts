import { describe, expect, it } from "vitest";
import { classifyPushFailure } from "@/lib/admin/notification-campaigns/campaign-push-failure-breakdown";

describe("푸시 실패 원인 분류 — 운영 실제 응답 (2026-10-30 「테스트입니다」 실패 9건 = FCM NotRegistered)", () => {
  it.each([
    [{ provider: "fcm", code: "NOT_FOUND", error: "NotRegistered" }, "expired_token"],
    [{ provider: "apns", error: '{"reason":"Unregistered","timestamp":1792652144900}' }, "expired_token"],
    [{ provider: "fcm", code: "INVALID_ARGUMENT", error: "The registration token is not a valid FCM registration token" }, "invalid_token"],
    [{ provider: "apns", error: "The pending stream has been canceled (caused by: )" }, "temporary"],
    [{ provider: "fcm", code: "INTERNAL", error: "Internal error occurred." }, "temporary"],
    [{ provider: "apns", error: "apns_http_0" }, "temporary"],
    [null, "other"],
  ])("%j → %s", (resp, reason) => {
    expect(classifyPushFailure(resp).reason).toBe(reason);
  });

  it("공급자·응답 원문(짧게)을 함께 돌려준다", () => {
    const c = classifyPushFailure({ provider: "fcm", code: "NOT_FOUND", error: "NotRegistered" });
    expect(c.provider).toBe("fcm");
    expect(c.detail).toBe("NOT_FOUND · NotRegistered");
  });
});
