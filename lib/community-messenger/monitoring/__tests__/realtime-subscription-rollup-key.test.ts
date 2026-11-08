/**
 * D1 — 실시간 구독 결과 집계 키 세분화 (docs/audit/realtime-subscription-diagnostics-rollup-design-2026-11-08.md)
 */
import { describe, expect, it } from "vitest";
import {
  isAllowedRealtimeSubscriptionRollupMetric,
  realtimeSubscriptionKindForScope,
  realtimeSubscriptionRollupMetric,
} from "../realtime-subscription-rollup-key";
import { buildMonitoringRollupRows } from "../monitoring-rollup";

const UID = "0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc";
const PID = "56d2a3c6-6090-4a3b-9986-a8668663fdc2";

/** 운영 코드 subscribeWithRetry scope 17종 (실제 값 형태 그대로, ID 포함) */
const PROD_SCOPES: Array<[string, string]> = [
  ["community-messenger:presence-runtime", "presence"],
  ["call_v4_incoming", "call_incoming"],
  ["community-messenger-call-client:session", "call_session"],
  ["community-messenger-call-client:hangup-signal", "call_hangup"],
  ["community-messenger-group-call:session", "group_call"],
  ["community-messenger:call-logs", "call_logs"],
  ["community-messenger-home:meta", "home_meta"],
  ["community-messenger-home:rooms-in", "home_rooms"],
  ["community-messenger-room:global-bundle", "room_bundle"],
  [`community-messenger-unread-sound:${UID}`, "unread_sound"],
  ["cm-room-friendship:friend-requests-global", "friend_requests"],
  [`cm-home:posts-trade-meta:${UID}`, "home_trade_meta"],
  [`chat-list:posts-listing:${UID}`, "chat_post_listing"],
  [`post-seller-listing:${PID}`, "post_seller_listing"],
  [`trade-chat-presence:${PID}`, "trade_presence"],
  [`trade-post-listing:${PID}`, "trade_post_listing"],
  ["trade-listing-visibility", "trade_listing_visibility"],
];

describe("realtimeSubscriptionKindForScope", () => {
  it.each(PROD_SCOPES)("%s → %s", (scope, kind) => {
    expect(realtimeSubscriptionKindForScope(scope)).toBe(kind);
  });

  it("표에 없는 scope·비문자열은 other", () => {
    expect(realtimeSubscriptionKindForScope("something-new:abc")).toBe("other");
    expect(realtimeSubscriptionKindForScope(undefined)).toBe("other");
    expect(realtimeSubscriptionKindForScope(42)).toBe("other");
  });
});

describe("realtimeSubscriptionRollupMetric", () => {
  it("종류·상태·단계로 세분화하고 ID 는 키에 들어가지 않는다", () => {
    for (const [scope, kind] of PROD_SCOPES) {
      const m = realtimeSubscriptionRollupMetric("realtime.subscription", "channel_subscribe", {
        scope,
        outcome: "error",
        status: "CHANNEL_ERROR",
        attemptPhase: "retry",
      });
      expect(m).toBe(`channel_subscribe.${kind}.channel_error.retry`);
      expect(String(m)).not.toContain(UID);
      expect(String(m)).not.toContain(PID);
      expect(isAllowedRealtimeSubscriptionRollupMetric(m)).toBe(true);
      expect(String(m)).toMatch(/^[a-z0-9_.:-]{1,96}$/);
    }
  });

  it("상태 4종과 알 수 없는 상태, 단계 기본값", () => {
    const of = (status: unknown, attemptPhase?: unknown) =>
      realtimeSubscriptionRollupMetric("realtime.subscription", "channel_subscribe", {
        scope: "call_v4_incoming",
        status,
        attemptPhase,
      });
    expect(of("SUBSCRIBED")).toBe("channel_subscribe.call_incoming.subscribed.initial");
    expect(of("CHANNEL_ERROR", "retry")).toBe("channel_subscribe.call_incoming.channel_error.retry");
    expect(of("TIMED_OUT")).toBe("channel_subscribe.call_incoming.timed_out.initial");
    expect(of("CLOSED", "retry")).toBe("channel_subscribe.call_incoming.closed.retry");
    expect(of("WEIRD")).toBe("channel_subscribe.call_incoming.unknown.initial");
    expect(of(undefined)).toBe("channel_subscribe.call_incoming.unknown.initial");
  });

  it("대상이 아닌 이벤트는 metric 을 그대로 돌려주고, 이상한 라벨에도 예외가 없다", () => {
    expect(realtimeSubscriptionRollupMetric("chat.room_load", "bootstrap_fetch", { scope: "x" })).toBe("bootstrap_fetch");
    expect(realtimeSubscriptionRollupMetric("realtime.subscription", "silent_scope", {})).toBe("silent_scope");
    expect(() => realtimeSubscriptionRollupMetric("realtime.subscription", "channel_subscribe", null)).not.toThrow();
    expect(realtimeSubscriptionRollupMetric("realtime.subscription", "channel_subscribe", null)).toBe(
      "channel_subscribe.other.unknown.initial",
    );
  });
});

describe("isAllowedRealtimeSubscriptionRollupMetric (위조 방어)", () => {
  it("허용 표와 정확히 맞는 것만 통과", () => {
    expect(isAllowedRealtimeSubscriptionRollupMetric("channel_subscribe.presence.closed.retry")).toBe(true);
    expect(isAllowedRealtimeSubscriptionRollupMetric("channel_subscribe.attacker.closed.retry")).toBe(false);
    expect(isAllowedRealtimeSubscriptionRollupMetric("channel_subscribe.presence.closed")).toBe(false);
    expect(isAllowedRealtimeSubscriptionRollupMetric("channel_subscribe.presence.closed.retry.x")).toBe(false);
    expect(isAllowedRealtimeSubscriptionRollupMetric("channel_subscribe.presence.boom.retry")).toBe(false);
    expect(isAllowedRealtimeSubscriptionRollupMetric(1)).toBe(false);
  });
});

describe("buildMonitoringRollupRows — D1", () => {
  it("실시간 구독 결과 이벤트는 서버가 라벨로 세분 키를 만들고 outcome 은 유지", () => {
    const rows = buildMonitoringRollupRows([
      {
        category: "realtime.subscription",
        metric: "channel_subscribe",
        value: 1,
        labels: { scope: "community-messenger:presence-runtime", outcome: "error", status: "CLOSED", attemptPhase: "retry" },
      },
      {
        category: "realtime.subscription",
        metric: "channel_subscribe",
        value: 1,
        labels: { scope: "community-messenger:presence-runtime", outcome: "error", status: "CLOSED", attemptPhase: "retry" },
      },
      {
        category: "realtime.subscription",
        metric: "channel_subscribe",
        value: 1,
        labels: { scope: "call_v4_incoming", outcome: "ok", status: "SUBSCRIBED", attemptPhase: "initial" },
      },
    ]);
    expect(rows.map((r) => [r.metric, r.outcome, r.event_count])).toEqual([
      ["channel_subscribe.presence.closed.retry", "error", 2],
      ["channel_subscribe.call_incoming.subscribed.initial", "ok", 1],
    ]);
  });

  it("이벤트 metric 을 위조한 세분 키로 보내면 channel_subscribe 로 되돌린다", () => {
    const rows = buildMonitoringRollupRows([
      { category: "realtime.subscription", metric: "channel_subscribe.attacker_1.closed.retry", labels: {} },
    ]);
    expect(rows.map((r) => r.metric)).toEqual(["channel_subscribe"]);
  });

  it("버린 수: 허용 세분 키는 그대로, 위조 키는 channel_subscribe 로 합친다", () => {
    const rows = buildMonitoringRollupRows(
      [],
      [
        { category: "realtime.subscription", metric: "channel_subscribe.presence.closed.retry", count: 500 },
        { category: "realtime.subscription", metric: "channel_subscribe.evil.closed.retry", count: 3 },
        { category: "realtime.subscription", metric: "channel_subscribe.evil2.closed.retry", count: 4 },
        { category: "chat.room_load", metric: "bootstrap_fetch", count: 9 },
      ],
    );
    expect(rows.map((r) => [r.category, r.metric, r.dropped_count])).toEqual([
      ["realtime.subscription", "channel_subscribe.presence.closed.retry", 500],
      ["realtime.subscription", "channel_subscribe", 7],
      ["chat.room_load", "bootstrap_fetch", 9],
    ]);
  });

  it("다른 이벤트 종류는 지금과 같다", () => {
    const rows = buildMonitoringRollupRows([
      { category: "realtime.subscription", metric: "silent_scope", value: 20000, labels: { scope: "call_v4_incoming" } },
    ]);
    expect(rows.map((r) => r.metric)).toEqual(["silent_scope"]);
  });
});
