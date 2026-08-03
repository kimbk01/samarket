import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_EVENT_DEFINITIONS,
  eventTypeForAdminCampaignType,
  getNotificationEventDefinition,
} from "@/lib/notifications/core/notification-event-registry";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/core/notification-event-types";
import { getRegistryEvent } from "@/lib/notifications/notification-sound-registry";
import { resolveNotificationDeepLink } from "@/lib/notifications/policy/notification-deeplink-policy";

const androidChannelRegistrySource = readFileSync(
  join(
    process.cwd(),
    "android/app/src/main/java/com/dibay/app/DibayNotificationChannelRegistry.java"
  ),
  "utf8"
);

describe("notification event registry SSOT", () => {
  it("defines every event type exactly once", () => {
    expect(Object.keys(NOTIFICATION_EVENT_DEFINITIONS).sort()).toEqual(
      [...NOTIFICATION_EVENT_TYPES].sort()
    );
    expect(new Set(NOTIFICATION_EVENT_TYPES).size).toBe(
      NOTIFICATION_EVENT_TYPES.length
    );
  });

  it("references existing sound events and native Android channels", () => {
    for (const definition of Object.values(NOTIFICATION_EVENT_DEFINITIONS)) {
      if (definition.soundEventKey) {
        expect(
          getRegistryEvent(definition.soundEventKey),
          definition.type
        ).toBeDefined();
      }
      if (definition.androidChannelKey) {
        expect(
          androidChannelRegistrySource,
          `${definition.type}:${definition.androidChannelKey}`
        ).toContain(`"${definition.androidChannelKey}"`);
      }
    }
  });

  it("keeps call establishment outside general notification sound policy", () => {
    const incoming = getNotificationEventDefinition("incoming_call_signal");
    expect(incoming.soundEventKey).toBeNull();
    expect(incoming.androidChannelKey).toBeNull();
    expect(incoming.foregroundPolicy).toBe("call_authority_only");
    expect(incoming.bellPolicy).toBe("exclude");
    expect(incoming.appIconPolicy).toBe("exclude");
  });

  it("does not use message event counts as the app icon projection", () => {
    for (const type of [
      "chat_message",
      "group_message",
      "trade_message",
      "store_order_message",
    ] as const) {
      expect(getNotificationEventDefinition(type).appIconPolicy).toBe(
        "domain_room_projection"
      );
    }
    expect(getNotificationEventDefinition("admin_notice").appIconPolicy).toBe(
      "exclude"
    );
  });

  it("gates marketing and derives Admin campaign event types", () => {
    expect(
      getNotificationEventDefinition("admin_marketing_banner").preferenceKey
    ).toBe("marketing");
    expect(eventTypeForAdminCampaignType("marketing")).toBe(
      "admin_marketing_banner"
    );
    expect(eventTypeForAdminCampaignType("notice")).toBe("admin_notice");
    expect(eventTypeForAdminCampaignType("system")).toBe("admin_notice");
    expect(getNotificationEventDefinition("admin_marketing_banner").bellPolicy).toBe("include");
    const adminTest = getNotificationEventDefinition("admin_test");
    expect(adminTest.bellPolicy).toBe("exclude");
    expect(adminTest.appIconPolicy).toBe("exclude");
    expect(adminTest.ttlSeconds).toBeLessThanOrEqual(3_600);
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261012120000_notification_admin_test_registry.sql"
      ),
      "utf8"
    );
    expect(migration).toContain("'admin_test'");
  });

  it("resolves every deep-link key to an internal route", () => {
    for (const definition of Object.values(NOTIFICATION_EVENT_DEFINITIONS)) {
      const route = resolveNotificationDeepLink(
        definition.deepLinkResolverKey,
        {
          roomId: "room id",
          callSessionId: "call id",
          displayRoute: "/notifications?source=test",
        }
      );
      expect(route, definition.type).toMatch(/^\/(?!\/)/);
    }
    expect(
      resolveNotificationDeepLink("display_route", {
        displayRoute: "https://evil.example/path",
      })
    ).toBe("/notifications");
  });
});
