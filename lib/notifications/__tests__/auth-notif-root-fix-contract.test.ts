import { describe, expect, it } from "vitest";
import {
  buildCommunityPostNotificationPath,
  canonicalizeLegacyCommunityPostNotificationPath,
} from "@/lib/notifications/community-post-notification-destination";
import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";
import {
  mapNotificationEventToInboxRow,
  resolveBellPresentationType,
  resolveEventInboxLinkUrl,
  type NotificationEventInboxSource,
} from "@/lib/notifications/inbox-events-merge";
import { resolveInboxSurfaceBadge } from "@/lib/notifications/notification-inbox-surface-label";
import { matchesNotificationCenterMemberTab } from "@/lib/notifications/notification-center-tab-match";
import { resolvePushAuthGate } from "@/components/push/PushRouteListener";

const POST_ID = "1de63c09-e98f-478e-9e44-5e93e9302222";

describe("community post notification destination SSOT", () => {
  it("canonical path is /community/posts/:id", () => {
    expect(buildCommunityPostNotificationPath(POST_ID)).toBe(`/community/posts/${POST_ID}`);
  });

  it("heals legacy /philife/posts/:uuid at read time", () => {
    expect(canonicalizeLegacyCommunityPostNotificationPath(`/philife/posts/${POST_ID}`)).toBe(
      `/community/posts/${POST_ID}`
    );
    expect(
      resolveSafeNotificationInternalRoute(`/philife/posts/${POST_ID}`)
    ).toBe(`/community/posts/${POST_ID}`);
  });

  it("does not invent heal for non-uuid tails", () => {
    expect(canonicalizeLegacyCommunityPostNotificationPath("/philife/posts/not-a-uuid")).toBeNull();
  });
});

describe("community_activity presentation is community not system", () => {
  function event(overrides: Partial<NotificationEventInboxSource> = {}): NotificationEventInboxSource {
    return {
      id: "evt-1",
      type: "community_activity",
      category: "community_activity",
      title: "새 댓글",
      body: "안녕",
      display_payload: {
        routeUrl: `/philife/posts/${POST_ID}`,
        legacyPushKind: "community",
        legacyMeta: { kind: "community_comment", post_id: POST_ID },
        legacyNotificationType: "report",
      },
      read_at: null,
      created_at: "2026-08-13T07:57:02.000Z",
      dedupe_key: "c:1",
      room_id: null,
      ...overrides,
    };
  }

  it("maps bell presentation to community_activity", () => {
    expect(resolveBellPresentationType(event())).toBe("community_activity");
  });

  it("surface badge is 커뮤니티", () => {
    const row = mapNotificationEventToInboxRow(event());
    expect(resolveInboxSurfaceBadge(row, "ko")).toBe("커뮤니티");
  });

  it("heals poisoned routeUrl to canonical community post", () => {
    expect(resolveEventInboxLinkUrl(event())).toBe(`/community/posts/${POST_ID}`);
  });

  it("matches community tab and not system-only tokens alone", () => {
    const row = mapNotificationEventToInboxRow(event());
    expect(
      matchesNotificationCenterMemberTab(
        {
          push_kind: row.push_kind,
          notification_type: row.notification_type,
          event_type: row.event_type,
          bell_presentation_type: row.bell_presentation_type,
        },
        "community"
      )
    ).toBe(true);
    expect(
      matchesNotificationCenterMemberTab(
        {
          push_kind: row.push_kind,
          notification_type: row.notification_type,
          event_type: row.event_type,
          bell_presentation_type: row.bell_presentation_type,
        },
        "system"
      )
    ).toBe(false);
  });
});

describe("resolvePushAuthGate — recovering ≠ guest", () => {
  it("holds on loading/recovering for auth-required routes", () => {
    expect(resolvePushAuthGate("loading", "/notifications")).toBe("hold");
    expect(resolvePushAuthGate("recovering", "/philife/abc")).toBe("hold");
    expect(resolvePushAuthGate("recovering", "/community-messenger/rooms/r1")).toBe("hold");
  });

  it("allows when authenticated", () => {
    expect(resolvePushAuthGate("authenticated", "/notifications")).toBe("allow");
  });

  it("opens login only for terminal_guest / corrupt", () => {
    expect(resolvePushAuthGate("terminal_guest", "/notifications")).toBe("login");
    expect(resolvePushAuthGate("corrupt", "/mypage")).toBe("login");
  });

  it("allows public community post without auth gate", () => {
    expect(resolvePushAuthGate("loading", `/community/posts/${POST_ID}`)).toBe("allow");
  });
});
