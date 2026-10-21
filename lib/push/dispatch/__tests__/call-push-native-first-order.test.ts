import { describe, expect, it } from "vitest";
import { orderCallPushTargetsNativeFirst } from "@/lib/push/dispatch/dispatch-push-for-user";

describe("통화 푸시 대상 순서 — 네이티브 통화 채널 우선", () => {
  it("같은 iPhone 의 apns 알림 행이 앞서도 voip_apns 를 먼저 보낸다 (2026-10-22 지연 링)", () => {
    const ordered = orderCallPushTargetsNativeFirst([
      { id: "alert", push_provider: "apns" as const },
      { id: "voip", push_provider: "voip_apns" as const },
    ]);
    expect(ordered.map((t) => t.id)).toEqual(["voip", "alert"]);
  });

  it("voip_apns → fcm → 그 외, 같은 순위는 기존(last_seen_at) 순서 유지", () => {
    const ordered = orderCallPushTargetsNativeFirst([
      { id: "web", push_provider: "web_push" as const },
      { id: "fcm-a", push_provider: "fcm" as const },
      { id: "alert", push_provider: "apns" as const },
      { id: "voip", push_provider: "voip_apns" as const },
      { id: "fcm-b", push_provider: "fcm" as const },
    ]);
    expect(ordered.map((t) => t.id)).toEqual(["voip", "fcm-a", "fcm-b", "web", "alert"]);
  });
});
