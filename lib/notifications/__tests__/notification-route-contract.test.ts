/**
 * C2·C6 목적지 계약 — Android·TypeScript 공용 기준표(fixture) 검사.
 * docs/audit/notification-system-ssot-hardlock-reaudit-2026-11-01.md §3 C2·C6, §4 HARD LOCK.
 *
 * - 기준표: lib/notifications/contracts/notification-route-fixtures.json
 *   (Android `NotificationRouteContractTest.java` 가 같은 파일을 읽어 `FcmPayloadResolver` 를 검사한다)
 * - `current` 행: 지금 서버 빌더가 실제로 만드는 FCM data. 빌더 결과와 기준표가 다르면 실패(서버 변경 감지).
 * - `legacy` 행: 이미 기기에 도착해 있을 수 있는 예전 모양. 계약 목적지는 같다.
 * - `androidPending: "N1"` 행: Android 네이티브 수정(N1, Owner 승인 대기) 전까지 Android 결과가 계약과 다른 행.
 *   **current 행은 `androidPending` 을 가질 수 없다** — 지금 서버가 보내는 것은 모든 Android 빌드에서 계약대로여야 한다.
 *   단, 행이 없어 봉투가 필요한 push_only 시스템 캠페인만 예외로 표시한다(운영 발송 0건).
 * 기준표 갱신: UPDATE_NOTIFICATION_ROUTE_FIXTURES=1 npx vitest run <이 파일>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/runtime", () => ({ getSiteOrigin: () => "https://app.example" }));

import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import type {
  CreateNotificationEventInput,
  NotificationEventRow,
} from "@/lib/notifications/core/notification-event-schema";
import { finalizeNotificationEventRoute } from "@/lib/notifications/core/notification-event-final-route";
import { buildPushPayload } from "@/lib/notifications/pipeline/notify-push-dispatcher";
import { buildFcmDataFields } from "@/lib/push/dispatch/fcm-data-payload-contract";
import { resolvePushRouteFromFcmData } from "@/lib/push/resolve-push-route-from-fcm-data";
import { resolveEventInboxLinkUrl } from "@/lib/notifications/inbox-events-merge";

const FIXTURE_PATH = join(process.cwd(), "lib/notifications/contracts/notification-route-fixtures.json");

/** Android `FcmPayloadResolver`·웹 해석기가 읽는 경로 관련 키만 기준표에 둔다. */
const ROUTE_KEYS = [
  "type",
  "url",
  "routeUrl",
  "schemaVersion",
  "eventClass",
  "campaignChannel",
  "targetKind",
  "targetTab",
  "targetNotificationId",
  "targetApprovedRoute",
  "notificationId",
  "notificationEventId",
  "deeplinkResolverKey",
  "roomId",
  "postId",
  "orderId",
  "callId",
] as const;

export type RouteFixtureRow = {
  id: string;
  kind: "current" | "legacy";
  note: string;
  data: Record<string, string>;
  expected: string;
  androidPending?: "N1";
};

const EVT = "11111111-2222-4333-8444-555555555555";

function pick(fields: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ROUTE_KEYS) {
    const v = fields[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}

function fcm(out: Parameters<typeof buildFcmDataFields>[0]): Record<string, string> {
  return pick(buildFcmDataFields(out, undefined, { tag: "contract-tag" }) as Record<string, unknown>);
}

function storedEvent(input: Omit<CreateNotificationEventInput, "userId" | "dedupeKey" | "id">): NotificationEventRow {
  const fin = finalizeNotificationEventRoute({ ...input, id: EVT, userId: "u-1", dedupeKey: "k-1" });
  return {
    id: fin.id,
    user_id: "u-1",
    type: input.type,
    category: input.category,
    room_id: input.roomId ?? null,
    call_session_id: null,
    actor_user_id: null,
    message_id: null,
    title: input.title,
    body: input.body,
    display_payload: fin.displayPayload,
    unread: true,
    read_at: null,
    delivered_at: null,
    opened_at: null,
    muted_snapshot: false,
    push_suppressed_reason: null,
    sound_suppressed_reason: null,
    dedupe_key: "k-1",
    created_at: "2026-11-01T00:00:00.000Z",
  } as NotificationEventRow;
}

type CampaignInput = Parameters<typeof buildAdminCampaignNotificationPresentation>[0];

/** 실발송 경로와 같은 순서: 앱 안 행 저장(최종 목적지 확정) → 그 값으로 푸시 */
function campaignWithInboxRow(input: CampaignInput): Record<string, string> {
  const preview = buildAdminCampaignNotificationPresentation(input);
  const row = storedEvent({
    type: preview.eventType,
    category: preview.category as NotificationEventRow["category"],
    title: input.title,
    body: input.body,
    displayPayload: { ...preview.displayPayload },
  });
  const finalRouteUrl = String((row.display_payload as Record<string, unknown>).routeUrl ?? "");
  const p = buildAdminCampaignNotificationPresentation(input, {
    userId: "u-1",
    notificationEventId: row.id,
    finalRouteUrl,
  });
  return fcm(p.pushPayload);
}

function campaignPushOnly(input: CampaignInput): Record<string, string> {
  const p = buildAdminCampaignNotificationPresentation(input, { userId: "u-1", notificationEventId: null });
  return fcm(p.pushPayload);
}

function general(input: Omit<CreateNotificationEventInput, "userId" | "dedupeKey" | "id">): Record<string, string> {
  return fcm(buildPushPayload(storedEvent(input), 0));
}

function currentRows(): Array<Omit<RouteFixtureRow, "data"> & { data: Record<string, string> }> {
  const base = { body: "본문", category: "admin_notice" as NotificationEventRow["category"] };
  return [
    {
      id: "campaign_notice_inbox_no_destination",
      kind: "current",
      note: "공지 캠페인·목적지 없음 → 알림 상세 (Owner 캡처 「디바이 알림」)",
      data: campaignWithInboxRow({ title: "디바이 알림", body: "b", type: "notice", channel: "push_and_in_app", campaignId: "c1" }),
      expected: `/notifications/${EVT}`,
    },
    {
      id: "campaign_system_inbox_no_destination",
      kind: "current",
      note: "시스템 캠페인·목적지 없음 → 알림 상세 (Owner 정책 5: Android 도 정상)",
      data: campaignWithInboxRow({ title: "점검", body: "b", type: "system", channel: "push_and_in_app", campaignId: "c2" }),
      expected: `/notifications/${EVT}`,
    },
    {
      id: "campaign_system_inbox_app_route",
      kind: "current",
      note: "시스템 캠페인·지정 화면 → 그 화면",
      data: campaignWithInboxRow({
        title: "점검",
        body: "b",
        type: "system",
        channel: "push_and_in_app",
        campaignId: "c3",
        deeplink_url: "/market",
      }),
      expected: "/market",
    },
    {
      id: "campaign_marketing_inbox_no_destination",
      kind: "current",
      note: "마케팅 캠페인·목적지 없음 → 알림 상세",
      data: campaignWithInboxRow({ title: "혜택", body: "b", type: "marketing", channel: "push_and_in_app", campaignId: "c4" }),
      expected: `/notifications/${EVT}`,
    },
    {
      id: "campaign_notice_push_only_no_destination",
      kind: "current",
      note: "push_only 공지·목적지 없음 → 알림센터 + 「보관되지 않는 푸시」 안내 (C2 예외)",
      data: campaignPushOnly({ title: "공지", body: "b", type: "notice", channel: "push_only", campaignId: "c5" }),
      expected: "/notifications?fallback=push_only",
    },
    {
      id: "campaign_marketing_push_only_app_route",
      kind: "current",
      note: "push_only 마케팅·지정 화면 → 그 화면",
      data: campaignPushOnly({
        title: "혜택",
        body: "b",
        type: "marketing",
        channel: "push_only",
        campaignId: "c6",
        deeplink_url: "/market",
      }),
      expected: "/market",
    },
    {
      id: "campaign_system_push_only_no_destination",
      kind: "current",
      note: "push_only 시스템·목적지 없음 — Android build ≤24 는 admin_system 분기가 없어 /notifications(안내 없음). 운영 발송 0건",
      data: campaignPushOnly({ title: "점검", body: "b", type: "system", channel: "push_only", campaignId: "c7" }),
      expected: "/notifications?fallback=push_only",
      androidPending: "N1",
    },
    {
      id: "admin_notice_content_only",
      kind: "current",
      note: "원본 화면 없는 관리자 알림(채팅 신고 결과 등) → 알림 상세",
      data: general({
        ...base,
        type: "admin_notice",
        title: "신고 처리 결과",
        displayPayload: { routeUrl: null, legacyPushKind: "notice", legacyMeta: { kind: "chat_report_result" } },
      }),
      expected: `/notifications/${EVT}`,
    },
    {
      id: "admin_notice_store_route",
      kind: "current",
      note: "매장 심사 결과 → 오너 매장 화면",
      data: general({
        ...base,
        type: "admin_notice",
        title: "매장 운영 재개",
        displayPayload: { routeUrl: "/stores/owner?storeId=s1", legacyMeta: { kind: "admin_store_decision" } },
      }),
      expected: "/stores/owner?storeId=s1",
    },
    {
      id: "community_comment",
      kind: "current",
      note: "댓글 → 게시글",
      data: general({
        type: "community_activity",
        category: "community_activity" as NotificationEventRow["category"],
        title: "zxzx11님이 댓글을 남겼어요",
        body: "u4claude2015",
        displayPayload: {
          routeUrl: "/community/posts/p1",
          legacyMeta: { kind: "community_comment", post_id: "p1", comment_id: "cm1" },
        },
      }),
      expected: "/community/posts/p1",
    },
    {
      id: "chat_message",
      kind: "current",
      note: "메신저 1:1 → 대화방",
      data: general({
        type: "chat_message",
        category: "chat_message" as NotificationEventRow["category"],
        title: "w테스트1",
        body: "hi",
        roomId: "room-1",
        chatDomain: "general_direct",
        domainIdentityKey: "general_direct:room-1",
        displayPayload: { routeUrl: "/community-messenger/rooms/room-1", chatDomain: "general_direct" },
      }),
      expected: "/community-messenger/rooms/room-1",
    },
    {
      id: "order_status_buyer",
      kind: "current",
      note: "구매자 주문 상태 → 주문",
      data: general({
        type: "order_status",
        category: "order_status" as NotificationEventRow["category"],
        title: "주문이 취소됐어요",
        body: "b",
        displayPayload: {
          routeUrl: "/orders?expand=o1",
          legacyMeta: { kind: "store_order_owner_status", order_id: "o1" },
        },
      }),
      expected: "/orders?expand=o1",
    },
    {
      id: "support_case_reply",
      kind: "current",
      note: "고객센터 답변 → 문의 상세",
      data: general({
        type: "support_admin_replied" as NotificationEventRow["type"],
        category: "inquiry_answered" as NotificationEventRow["category"],
        title: "문의에 답변이 왔어요",
        body: "b",
        displayPayload: { routeUrl: "/support/cases/c01ffd4d-f2b4-4e6e-93e0-034fc69fe96f", supportCaseId: "c01ffd4d-f2b4-4e6e-93e0-034fc69fe96f" },
      }),
      expected: "/support/cases/c01ffd4d-f2b4-4e6e-93e0-034fc69fe96f",
    },
  ];
}

const LEGACY_ROWS: RouteFixtureRow[] = [
  {
    id: "legacy_envelope_notice_no_approved_route",
    kind: "legacy",
    note: "2026-08-03~11-01 서버가 보낸 공지 봉투(승인 경로 없음). 계약 = 알림 상세. Android build ≤24 는 목록(?tab=system)",
    data: {
      schemaVersion: "1",
      eventClass: "admin_notice",
      campaignChannel: "push_and_in_app",
      targetKind: "notification",
      targetTab: "notice",
      targetNotificationId: EVT,
      notificationId: EVT,
      notificationEventId: EVT,
      url: "/notifications",
      type: "notification",
    },
    expected: `/notifications/${EVT}`,
    androidPending: "N1",
  },
  {
    id: "legacy_envelope_system_approved_route",
    kind: "legacy",
    note: "11-01 A 이후~W2 이전 시스템 캠페인 봉투. 계약 = 승인 경로. Android build ≤24 는 admin_system 분기 없음 → /notifications",
    data: {
      schemaVersion: "1",
      eventClass: "admin_system",
      campaignChannel: "push_and_in_app",
      targetKind: "approved_internal_route",
      targetTab: "system",
      targetNotificationId: EVT,
      targetApprovedRoute: `/notifications/${EVT}`,
      notificationId: EVT,
      notificationEventId: EVT,
      url: `/notifications/${EVT}`,
      type: "notification",
    },
    expected: `/notifications/${EVT}`,
    androidPending: "N1",
  },
  {
    id: "legacy_envelope_notice_approved_route",
    kind: "legacy",
    note: "11-01 A 이후~W2 이전 공지 봉투(승인 경로 있음) — 모든 빌드 계약대로",
    data: {
      schemaVersion: "1",
      eventClass: "admin_notice",
      campaignChannel: "push_and_in_app",
      targetKind: "approved_internal_route",
      targetTab: "notice",
      targetNotificationId: EVT,
      targetApprovedRoute: `/notifications/${EVT}`,
      notificationId: EVT,
      url: `/notifications/${EVT}`,
      type: "notification",
    },
    expected: `/notifications/${EVT}`,
  },
];

function buildFixture(): RouteFixtureRow[] {
  return [...currentRows().map((r) => ({ ...r, data: r.data })), ...LEGACY_ROWS];
}

function readFixture(): RouteFixtureRow[] {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as RouteFixtureRow[];
}

describe("C2·C6 notification route contract (shared Android/TS fixture)", () => {
  if (process.env.UPDATE_NOTIFICATION_ROUTE_FIXTURES === "1") {
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(buildFixture(), null, 2)}\n`);
  }

  const fixture = readFixture();

  it("fixture current rows = what the server builders send today (no drift)", () => {
    const built = buildFixture().filter((r) => r.kind === "current");
    const fromFile = fixture.filter((r) => r.kind === "current");
    expect(fromFile).toEqual(built);
  });

  it("web/iOS resolver returns the contract destination for every row", () => {
    for (const row of fixture) {
      expect({ id: row.id, path: resolvePushRouteFromFcmData(row.data) }).toEqual({ id: row.id, path: row.expected });
    }
  });

  it("current campaign pushes with an in-app row carry no envelope (all Android builds use url)", () => {
    for (const row of fixture.filter((r) => r.kind === "current" && r.id.startsWith("campaign_") && r.id.includes("_inbox_"))) {
      expect({ id: row.id, eventClass: row.data.eventClass ?? null, url: row.data.url }).toEqual({
        id: row.id,
        eventClass: null,
        url: row.expected,
      });
    }
  });

  it("only the push_only system campaign may be Android-pending among current rows", () => {
    const pending = fixture.filter((r) => r.kind === "current" && r.androidPending).map((r) => r.id);
    expect(pending).toEqual(["campaign_system_push_only_no_destination"]);
  });

  it("C2: stored route is never the bare notification list", () => {
    const row = finalizeNotificationEventRoute({
      id: EVT,
      userId: "u-1",
      dedupeKey: "k",
      type: "notice_published",
      category: "notice_published" as NotificationEventRow["category"],
      title: "t",
      body: "b",
      displayPayload: { routeUrl: "/notifications", campaignType: "notice" },
    });
    expect(row.displayPayload.routeUrl).toBe(`/notifications/${EVT}`);
    // 목록·배너가 읽는 링크도 같은 값
    expect(
      resolveEventInboxLinkUrl({
        id: EVT,
        type: "notice_published",
        category: "notice_published" as NotificationEventRow["category"],
        title: "t",
        body: "b",
        display_payload: row.displayPayload,
        read_at: null,
        created_at: "2026-11-01T00:00:00.000Z",
        dedupe_key: "k",
        room_id: null,
      })
    ).toBe(`/notifications/${EVT}`);
  });

  it("C2: messenger/call routes stay owned by their pipelines (not rewritten)", () => {
    const row = finalizeNotificationEventRoute({
      id: EVT,
      userId: "u-1",
      dedupeKey: "k",
      type: "missed_call",
      category: "missed_call" as NotificationEventRow["category"],
      title: "부재중",
      body: "b",
      displayPayload: { routeUrl: "/community-messenger/rooms/r1" },
    });
    expect(row.displayPayload.routeUrl).toBe("/community-messenger/rooms/r1");
  });
});
