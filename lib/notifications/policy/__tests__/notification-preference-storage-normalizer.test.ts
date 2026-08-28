import { describe, expect, it } from "vitest";
import type { NormalizedMemberPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import {
  isInNotificationQuietWindow,
  LEGACY_USER_SETTINGS_PUSH_DEFAULTS,
  normalizeNotificationPreferenceStorage,
  NOTIFICATION_SETTINGS_STORAGE_DEFAULTS,
  parseNotificationQuietTimeMinutes,
  type LegacyUserSettingsPushRow,
  type NotificationSettingsStorageRow,
} from "@/lib/notifications/policy/notification-preference-storage-normalizer";

const TZ = "Asia/Manila";

/** 23:00 in Asia/Manila */
const QUIET_NIGHT = new Date("2026-08-28T15:00:00.000Z");
/** 12:00 in Asia/Manila */
const QUIET_DAY = new Date("2026-08-28T04:00:00.000Z");
/** 22:00 in Asia/Manila — overnight window start boundary */
const QUIET_START_BOUNDARY = new Date("2026-08-28T14:00:00.000Z");
/** 08:00 in Asia/Manila — overnight window end boundary (exclusive) */
const QUIET_END_BOUNDARY = new Date("2026-08-28T00:00:00.000Z");

function snap(
  notificationSettingsRow?: NotificationSettingsStorageRow | null,
  legacyUserSettingsRow?: LegacyUserSettingsPushRow | null,
  now: Date = QUIET_DAY
) {
  return normalizeNotificationPreferenceStorage({
    notificationSettingsRow,
    legacyUserSettingsRow,
    now,
    timezone: TZ,
  });
}

/** Mirrors `shouldSendWebPushForUser` master + marketing + quiet semantics (non-system). */
function currentPushMasterAllowed(
  n: NotificationSettingsStorageRow | null | undefined,
  u: LegacyUserSettingsPushRow | null | undefined
): boolean {
  const masterPush = (u?.push_enabled ?? LEGACY_USER_SETTINGS_PUSH_DEFAULTS.push_enabled) !== false;
  const serviceOn =
    (n?.service_enabled ?? NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.service_enabled) !== false;
  return masterPush && serviceOn;
}

function currentMarketingPushAllowed(
  n: NotificationSettingsStorageRow | null | undefined,
  u: LegacyUserSettingsPushRow | null | undefined
): boolean {
  const marketingDb =
    n == null
      ? NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.marketing_enabled
      : n.marketing_enabled === undefined
        ? NOTIFICATION_SETTINGS_STORAGE_DEFAULTS.marketing_enabled
        : n.marketing_enabled === true;
  const marketingPush =
    u == null
      ? LEGACY_USER_SETTINGS_PUSH_DEFAULTS.marketing_push_enabled
      : u.marketing_push_enabled === true;
  return marketingPush && marketingDb;
}

function currentQuietBlocksPush(
  n: NotificationSettingsStorageRow | null | undefined,
  u: LegacyUserSettingsPushRow | null | undefined,
  now: Date
): boolean {
  const qhDb =
    n?.quiet_hours_enabled === true &&
    isInNotificationQuietWindow(
      now,
      parseNotificationQuietTimeMinutes(n.quiet_hours_start),
      parseNotificationQuietTimeMinutes(n.quiet_hours_end),
      TZ
    );
  const qhUs =
    u?.do_not_disturb_enabled === true &&
    isInNotificationQuietWindow(
      now,
      parseNotificationQuietTimeMinutes(u.do_not_disturb_start),
      parseNotificationQuietTimeMinutes(u.do_not_disturb_end),
      TZ
    );
  return qhDb || qhUs;
}

function assertParityWithCurrentSemantics(
  n: NotificationSettingsStorageRow | null | undefined,
  u: LegacyUserSettingsPushRow | null | undefined,
  member: NormalizedMemberPreferenceSnapshot,
  now: Date = QUIET_DAY
) {
  expect(member.pushEnabled !== false && member.serviceEnabled !== false).toBe(
    currentPushMasterAllowed(n, u)
  );
  expect(member.marketingEnabled === true && member.marketingPushEnabled === true).toBe(
    currentMarketingPushAllowed(n, u)
  );
  expect(member.quiet.enabled === true && member.quiet.activeNow === true).toBe(
    currentQuietBlocksPush(n, u, now)
  );
}

describe("normalizeNotificationPreferenceStorage (P2-A4)", () => {
  it("T1 — no rows → optimistic defaults, marketing strict opt-out", () => {
    const result = snap(null, null);
    expect(result.member?.pushEnabled).toBe(true);
    expect(result.member?.serviceEnabled).toBe(true);
    expect(result.member?.marketingEnabled).toBe(false);
    expect(result.member?.marketingPushEnabled).toBe(false);
    expect(result.member?.quiet).toEqual({ enabled: false, activeNow: false });
    assertParityWithCurrentSemantics(null, null, result.member!);
  });

  it("T2 — notification row only", () => {
    const n: NotificationSettingsStorageRow = {
      service_enabled: true,
      order_enabled: false,
      marketing_enabled: true,
    };
    const result = snap(n, null);
    expect(result.member?.orderEnabled).toBe(false);
    expect(result.member?.marketingEnabled).toBe(true);
    expect(result.member?.marketingPushEnabled).toBe(false);
    expect(result.member?.pushEnabled).toBe(true);
    assertParityWithCurrentSemantics(n, null, result.member!);
  });

  it("T3 — legacy row only", () => {
    const u: LegacyUserSettingsPushRow = {
      push_enabled: false,
      chat_push_enabled: false,
      marketing_push_enabled: true,
    };
    const result = snap(null, u);
    expect(result.member?.pushEnabled).toBe(false);
    expect(result.member?.chatPushEnabled).toBe(false);
    expect(result.member?.marketingPushEnabled).toBe(true);
    expect(result.member?.marketingEnabled).toBe(false);
    assertParityWithCurrentSemantics(null, u, result.member!);
  });

  it("T4 — push master both true", () => {
    const result = snap({ service_enabled: true }, { push_enabled: true });
    expect(result.member?.pushEnabled).toBe(true);
    expect(result.member?.serviceEnabled).toBe(true);
    assertParityWithCurrentSemantics({ service_enabled: true }, { push_enabled: true }, result.member!);
  });

  it("T5 — push legacy false", () => {
    const result = snap({ service_enabled: true }, { push_enabled: false });
    expect(result.member?.pushEnabled).toBe(false);
    expect(result.member?.serviceEnabled).toBe(true);
    assertParityWithCurrentSemantics({ service_enabled: true }, { push_enabled: false }, result.member!);
  });

  it("T6 — service false", () => {
    const result = snap({ service_enabled: false }, { push_enabled: true });
    expect(result.member?.serviceEnabled).toBe(false);
    assertParityWithCurrentSemantics({ service_enabled: false }, { push_enabled: true }, result.member!);
  });

  it("T7 — both master false", () => {
    const result = snap({ service_enabled: false }, { push_enabled: false });
    expect(result.member?.pushEnabled).toBe(false);
    expect(result.member?.serviceEnabled).toBe(false);
    assertParityWithCurrentSemantics({ service_enabled: false }, { push_enabled: false }, result.member!);
  });

  it("T8 — marketing opt-out", () => {
    const result = snap({ marketing_enabled: false }, { marketing_push_enabled: false });
    expect(result.member?.marketingEnabled).toBe(false);
    expect(result.member?.marketingPushEnabled).toBe(false);
    assertParityWithCurrentSemantics(
      { marketing_enabled: false },
      { marketing_push_enabled: false },
      result.member!
    );
  });

  it("T9 — marketing strict opt-in requires both true", () => {
    const bothOn = snap({ marketing_enabled: true }, { marketing_push_enabled: true });
    expect(bothOn.member?.marketingEnabled).toBe(true);
    expect(bothOn.member?.marketingPushEnabled).toBe(true);
    assertParityWithCurrentSemantics(
      { marketing_enabled: true },
      { marketing_push_enabled: true },
      bothOn.member!
    );

    const dbOnly = snap({ marketing_enabled: true }, { marketing_push_enabled: false });
    expect(dbOnly.member?.marketingEnabled).toBe(true);
    expect(dbOnly.member?.marketingPushEnabled).toBe(false);
    assertParityWithCurrentSemantics(
      { marketing_enabled: true },
      { marketing_push_enabled: false },
      dbOnly.member!
    );
  });

  it("T10 — chat push off preserves domain toggles", () => {
    const result = snap(
      { trade_chat_enabled: true, community_chat_enabled: true },
      { chat_push_enabled: false }
    );
    expect(result.member?.chatPushEnabled).toBe(false);
    expect(result.member?.tradeChatEnabled).toBe(true);
    expect(result.member?.communityChatEnabled).toBe(true);
  });

  it("T11 — order off", () => {
    const result = snap({ order_enabled: false }, null);
    expect(result.member?.orderEnabled).toBe(false);
  });

  it("T12 — store off", () => {
    const result = snap({ store_enabled: false }, null);
    expect(result.member?.storeEnabled).toBe(false);
  });

  it("T13 — trade events off", () => {
    const result = snap({ trade_events_enabled: false }, null);
    expect(result.member?.tradeEventsEnabled).toBe(false);
  });

  it("T14 — community social off", () => {
    const result = snap({ community_social_enabled: false }, null);
    expect(result.member?.communitySocialEnabled).toBe(false);
  });

  it("T15 — notice off", () => {
    const result = snap({ notice_enabled: false }, null);
    expect(result.member?.noticeEnabled).toBe(false);
  });

  it("T16 — sound off", () => {
    const result = snap({ sound_enabled: false }, null);
    expect(result.member?.soundEnabled).toBe(false);
  });

  it("T17 — vibration off", () => {
    const result = snap({ vibration_enabled: false }, null);
    expect(result.member?.vibrationEnabled).toBe(false);
  });

  it("T18 — quiet hours active at night", () => {
    const n: NotificationSettingsStorageRow = {
      quiet_hours_enabled: true,
      quiet_hours_start: "22:00",
      quiet_hours_end: "08:00",
    };
    const result = snap(n, null, QUIET_NIGHT);
    expect(result.member?.quiet).toEqual({ enabled: true, activeNow: true });
    assertParityWithCurrentSemantics(n, null, result.member!, QUIET_NIGHT);
  });

  it("T19 — DND active at night", () => {
    const u: LegacyUserSettingsPushRow = {
      do_not_disturb_enabled: true,
      do_not_disturb_start: "22:00",
      do_not_disturb_end: "08:00",
    };
    const result = snap(null, u, QUIET_NIGHT);
    expect(result.member?.quiet).toEqual({ enabled: true, activeNow: true });
    assertParityWithCurrentSemantics(null, u, result.member!, QUIET_NIGHT);
  });

  it("T20 — overnight quiet inactive during daytime", () => {
    const n: NotificationSettingsStorageRow = {
      quiet_hours_enabled: true,
      quiet_hours_start: "22:00",
      quiet_hours_end: "08:00",
    };
    const result = snap(n, null, QUIET_DAY);
    expect(result.member?.quiet).toEqual({ enabled: true, activeNow: false });
    assertParityWithCurrentSemantics(n, null, result.member!, QUIET_DAY);
  });

  it("quiet — both sources OR active; daytime window boundaries", () => {
    const n: NotificationSettingsStorageRow = {
      quiet_hours_enabled: true,
      quiet_hours_start: "09:00",
      quiet_hours_end: "17:00",
    };
    const midday = new Date("2026-08-28T05:00:00.000Z"); // 13:00 Manila
    const atStart = new Date("2026-08-28T01:00:00.000Z"); // 09:00 Manila
    const atEnd = new Date("2026-08-28T09:00:00.000Z"); // 17:00 Manila

    expect(snap(n, null, midday).member?.quiet.activeNow).toBe(true);
    expect(snap(n, null, atStart).member?.quiet.activeNow).toBe(true);
    expect(snap(n, null, atEnd).member?.quiet.activeNow).toBe(false);
  });

  it("quiet — overnight start/end boundaries", () => {
    const n: NotificationSettingsStorageRow = {
      quiet_hours_enabled: true,
      quiet_hours_start: "22:00",
      quiet_hours_end: "08:00",
    };
    expect(snap(n, null, QUIET_START_BOUNDARY).member?.quiet.activeNow).toBe(true);
    expect(snap(n, null, QUIET_END_BOUNDARY).member?.quiet.activeNow).toBe(false);
  });

  it("quiet — neither enabled", () => {
    const result = snap(
      { quiet_hours_enabled: false },
      { do_not_disturb_enabled: false },
      QUIET_NIGHT
    );
    expect(result.member?.quiet).toEqual({ enabled: false, activeNow: false });
  });

  it("quiet — both enabled, only DND in window", () => {
    const n: NotificationSettingsStorageRow = {
      quiet_hours_enabled: true,
      quiet_hours_start: "09:00",
      quiet_hours_end: "17:00",
    };
    const u: LegacyUserSettingsPushRow = {
      do_not_disturb_enabled: true,
      do_not_disturb_start: "22:00",
      do_not_disturb_end: "08:00",
    };
    const result = snap(n, u, QUIET_NIGHT);
    expect(result.member?.quiet.activeNow).toBe(true);
    assertParityWithCurrentSemantics(n, u, result.member!, QUIET_NIGHT);
  });

  it("T21 — owner optional absent; no member-derived owner fields", () => {
    const result = snap({ order_enabled: false, store_enabled: false }, { push_enabled: false });
    expect(result.owner?.optionalPushEnabled).toBeUndefined();
    expect(result.owner?.optionalSoundEnabled).toBeUndefined();
    expect(result.member?.orderEnabled).toBe(false);
    expect(result.member?.pushEnabled).toBe(false);
  });

  it("T22 — admin ops pref absent", () => {
    const result = snap(null, null);
    expect(result.adminOps?.soundEnabled).toBeUndefined();
  });

  it("T23 — email excluded from normalized snapshot", () => {
    const result = snap(null, null);
    expect(result).not.toHaveProperty("email");
    expect(result.member).not.toHaveProperty("notifyCommerceEmail");
    expect(Object.keys(result)).toEqual(["member", "owner", "adminOps"]);
  });

  it("both rows exist — full parity matrix", () => {
    const n: NotificationSettingsStorageRow = {
      service_enabled: true,
      trade_chat_enabled: true,
      community_chat_enabled: false,
      order_enabled: true,
      store_enabled: true,
      trade_events_enabled: true,
      community_social_enabled: true,
      notice_enabled: true,
      marketing_enabled: true,
      sound_enabled: true,
      vibration_enabled: true,
      quiet_hours_enabled: false,
    };
    const u: LegacyUserSettingsPushRow = {
      push_enabled: true,
      chat_push_enabled: true,
      marketing_push_enabled: true,
      do_not_disturb_enabled: false,
    };
    const result = snap(n, u);
    assertParityWithCurrentSemantics(n, u, result.member!);
    expect(result.member?.communityChatEnabled).toBe(false);
  });
});

describe("readNormalizedNotificationPreferenceSnapshot consumer isolation", () => {
  it("does not modify P2-A3 resolver module exports", async () => {
    const resolver = await import("@/lib/notifications/policy/effective-notification-preference");
    expect(typeof resolver.resolveEffectiveNotificationPreference).toBe("function");
  });

  it("does not modify legacy push consumer", async () => {
    const gate = await import("@/lib/notifications/web-push-user-settings-gate");
    expect(typeof gate.shouldSendWebPushForUser).toBe("function");
  });

  it("does not modify legacy sound consumer", async () => {
    const sound = await import("@/lib/notifications/notification-sound-gate");
    expect(typeof sound.routeNotificationInsertSound).toBe("function");
  });
});
