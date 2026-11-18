import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  NON_CALL_PUSH_ROUTE_REDELIVERY_IGNORE_MS,
  shouldIgnorePushRouteRedelivery,
} from "@/lib/push/push-route-redelivery-window";
import { resolvePushRouteFromFcmData } from "@/lib/push/resolve-push-route-from-fcm-data";

const ROOM = "/community-messenger/rooms/room-a";
const CALL = "/community-messenger/calls/call-a";
const T0 = 1_000_000;

describe("FAIL-3 — 이전 알림 재주입 거르기 창 (통화 경로 제외)", () => {
  it("창은 네이티브 재시도 사다리 최대 4초 + 1초 = 5초", () => {
    expect(NON_CALL_PUSH_ROUTE_REDELIVERY_IGNORE_MS).toBe(5_000);
  });

  it("같은 방 경로·다른 알림 id 가 첫 이동 2.5초 뒤 도착 → 이동 없음 (실측 m7)", () => {
    expect(shouldIgnorePushRouteRedelivery({ path: ROOM, at: T0 }, ROOM, T0 + 2_500)).toBe(true);
  });

  it("2.75초(실측 m4)·4초(사다리 마지막)도 이동 없음", () => {
    expect(shouldIgnorePushRouteRedelivery({ path: ROOM, at: T0 }, ROOM, T0 + 2_750)).toBe(true);
    expect(shouldIgnorePushRouteRedelivery({ path: ROOM, at: T0 }, ROOM, T0 + 4_000)).toBe(true);
  });

  it("5초 뒤 도착 → 이동함", () => {
    expect(shouldIgnorePushRouteRedelivery({ path: ROOM, at: T0 }, ROOM, T0 + 5_000)).toBe(false);
    expect(shouldIgnorePushRouteRedelivery({ path: ROOM, at: T0 }, ROOM, T0 + 6_000)).toBe(false);
  });

  it("다른 경로·이동 기록 없음 → 이동함", () => {
    expect(shouldIgnorePushRouteRedelivery({ path: ROOM, at: T0 }, "/community-messenger/rooms/room-b", T0 + 100)).toBe(false);
    expect(shouldIgnorePushRouteRedelivery(null, ROOM, T0)).toBe(false);
  });

  it("통화 경로는 대상 아님 — 0.1초·2.5초 뒤 같은 통화 경로도 이 거르기에 걸리지 않는다(불변)", () => {
    expect(shouldIgnorePushRouteRedelivery({ path: CALL, at: T0 }, CALL, T0 + 100)).toBe(false);
    expect(shouldIgnorePushRouteRedelivery({ path: CALL, at: T0 }, CALL, T0 + 2_500)).toBe(false);
  });

  it("부재중 통화 알림(방 경로)은 메신저 방 알림과 같은 5초 규칙", () => {
    const missed = resolvePushRouteFromFcmData({ type: "missed_call", callId: "c1", roomId: "room-a" });
    expect(missed).toBeTruthy();
    const path = missed as string;
    expect(path.startsWith("/community-messenger/calls/")).toBe(false);
    expect(shouldIgnorePushRouteRedelivery({ path, at: T0 }, path, T0 + 2_500)).toBe(true);
    expect(shouldIgnorePushRouteRedelivery({ path, at: T0 }, path, T0 + 5_000)).toBe(false);
  });
});

describe("FAIL-3 구조 계약 — PushRouteListener", () => {
  const listener = readFileSync("components/push/PushRouteListener.tsx", "utf8");
  it("이동 기록 거르기는 새 창 함수를 쓰고, lastRouteRef 거르기(2초·통화 포함)는 그대로", () => {
    expect(listener).toContain("shouldIgnorePushRouteRedelivery(delivered, path, now) && !isCallPushRoutePath(path)");
    expect(listener).toContain("const ROUTE_DEDUPE_MS = 2_000;");
    expect(listener).toContain(
      "if (last && last.path === path && now - last.at < ROUTE_DEDUPE_MS && !opts?.skipNotificationDedupe) {"
    );
  });
});
