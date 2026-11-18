import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  NON_CALL_PUSH_ROUTE_REDELIVERY_IGNORE_MS,
  PUSH_ROUTE_FIRST_NAVIGATION_IN_FLIGHT_MS,
  shouldIgnorePushRouteRedelivery,
} from "@/lib/push/push-route-redelivery-window";
import { resolvePushRouteFromFcmData } from "@/lib/push/resolve-push-route-from-fcm-data";

const ROOM = "/community-messenger/rooms/room-a";
const CALL = "/community-messenger/calls/call-a";
const LIST = "/community-messenger";
const T0 = 1_000_000;

const ignore = (path: string, dt: number, current = LIST) =>
  shouldIgnorePushRouteRedelivery({ path, at: T0 }, path, T0 + dt, current);

describe("FAIL-3 — 이전 알림 재주입 거르기 창 (통화 경로 제외)", () => {
  it("창은 네이티브 재시도 사다리 최대 4초 + 1초 = 5초 · 원래 창 2초", () => {
    expect(NON_CALL_PUSH_ROUTE_REDELIVERY_IGNORE_MS).toBe(5_000);
    expect(PUSH_ROUTE_FIRST_NAVIGATION_IN_FLIGHT_MS).toBe(2_000);
  });

  it("같은 방 경로·다른 알림 id 가 첫 이동 2.5초 뒤 도착(주소는 목록) → 이동 없음 (실측 m7)", () => {
    expect(ignore(ROOM, 2_500)).toBe(true);
  });

  it("2.75초(실측 m4)·4초(사다리 마지막)도 이동 없음", () => {
    expect(ignore(ROOM, 2_750)).toBe(true);
    expect(ignore(ROOM, 4_000)).toBe(true);
  });

  it("승인된 절충: 첫 이동 5초 안에는 같은 방의 새 알림도 무시된다(주소가 그 방이 아니면) · 5초부터 이동", () => {
    expect(ignore(ROOM, 4_999)).toBe(true);
    expect(ignore(ROOM, 5_000)).toBe(false);
    expect(ignore(ROOM, 6_000)).toBe(false);
  });

  it("2~5초 · 주소가 이미 그 방 → 거르지 않음(리스너의 same_route_ack 분기가 처리)", () => {
    expect(ignore(ROOM, 2_000, ROOM)).toBe(false);
    expect(ignore(ROOM, 2_500, ROOM)).toBe(false);
    expect(ignore(ROOM, 4_900, ROOM)).toBe(false);
  });

  it("2초 안 중복은 주소와 상관없이 원래대로 무시", () => {
    expect(ignore(ROOM, 80, ROOM)).toBe(true);
    expect(ignore(ROOM, 1_999, ROOM)).toBe(true);
    expect(ignore(ROOM, 80, LIST)).toBe(true);
  });

  it("다른 경로·이동 기록 없음 → 이동함", () => {
    expect(shouldIgnorePushRouteRedelivery({ path: ROOM, at: T0 }, "/community-messenger/rooms/room-b", T0 + 100, LIST)).toBe(false);
    expect(shouldIgnorePushRouteRedelivery(null, ROOM, T0, LIST)).toBe(false);
  });

  it("통화 경로는 대상 아님 — 0.1·2.5·4초, 주소와 상관없이 이 거르기에 걸리지 않는다(불변)", () => {
    for (const dt of [100, 2_500, 4_000]) {
      expect(ignore(CALL, dt, LIST)).toBe(false);
      expect(ignore(CALL, dt, CALL)).toBe(false);
    }
  });

  it("부재중 통화 알림(방 경로)은 메신저 방 알림과 같은 규칙", () => {
    const missed = resolvePushRouteFromFcmData({ type: "missed_call", callId: "c1", roomId: "room-a" });
    expect(missed).toBeTruthy();
    const path = missed as string;
    expect(path.startsWith("/community-messenger/calls/")).toBe(false);
    expect(ignore(path, 2_500)).toBe(true);
    expect(ignore(path, 2_500, path)).toBe(false);
    expect(ignore(path, 5_000)).toBe(false);
  });
});

describe("FAIL-3 구조 계약 — PushRouteListener", () => {
  const listener = readFileSync("components/push/PushRouteListener.tsx", "utf8");
  it("이동 기록 거르기는 현재 주소를 넣어 판정하고, lastRouteRef 거르기(2초·통화 포함)는 그대로", () => {
    expect(listener).toContain(
      "if (shouldIgnorePushRouteRedelivery(delivered, path, now, currentAppPath()) && !isCallPushRoutePath(path)) {"
    );
    expect(listener).toContain("const ROUTE_DEDUPE_MS = 2_000;");
    expect(listener).toContain(
      "if (last && last.path === path && now - last.at < ROUTE_DEDUPE_MS && !opts?.skipNotificationDedupe) {"
    );
  });
});
