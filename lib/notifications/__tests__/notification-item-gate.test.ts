/**
 * 알림 항목 어드민 설정 → 생성·푸시 판정 (notification-admin-item-ssot-audit-2026-11-02 §3-4 · Owner 승인 2026-11-02).
 * - 종 표시 끔: 행을 만들지 않는다(푸시도 없음).
 * - 푸시 끔: 행은 만들고 push_suppressed_reason = admin_item_disabled → 모든 푸시 경로(즉시·재시도)가 생략.
 * - 잠긴 항목(통화·채팅 행): 설정 표를 읽지도 않는다 · 끌 수 없다.
 * - 저장: 읽은 revision 이 다르면 409, 아무것도 쓰지 않는다.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createNotificationEvent } from "@/lib/notifications/core/notification-event-repository";
import { invalidateNotificationItemSettingsCache } from "@/lib/notifications/notification-item-settings";
import { saveNotificationItemSettings } from "@/lib/admin/notification-items/notification-items-admin.server";

type Row = Record<string, unknown>;

function fakeSb(settings: Row[]) {
  const tablesRead: string[] = [];
  const inserted: Row[] = [];
  const settingWrites: Row[] = [];
  const sb = {
    from(table: string) {
      tablesRead.push(table);
      if (table === "notification_item_settings") {
        return {
          select: async () => ({ data: settings, error: null }),
          insert: async (row: Row) => {
            settingWrites.push(row);
            return { error: null };
          },
          update: (patch: Row) => ({
            eq: () => ({
              eq: () => ({
                select: async () => {
                  settingWrites.push(patch);
                  return { data: [{ item_key: "x" }], error: null };
                },
              }),
            }),
          }),
        };
      }
      return {
        insert: (row: Row) => ({
          select: () => ({
            single: async () => {
              inserted.push(row);
              return { data: { ...row }, error: null };
            },
          }),
        }),
      };
    },
  };
  return { sb: sb as never, tablesRead, inserted, settingWrites };
}

const base = { userId: "u1", title: "t", body: "b", unread: true } as const;
/** 테스트 입력 — category 는 생성 함수가 type 으로 채운다. */
const create = (sb: never, input: Record<string, unknown>) => createNotificationEvent(sb, { ...base, ...input } as never);

beforeEach(() => invalidateNotificationItemSettingsCache());

describe("createNotificationEvent × 알림 항목 설정", () => {
  it("설정 없음 = 지금과 같음(행 생성 · 푸시 생략 없음)", async () => {
    const { sb, inserted } = fakeSb([]);
    const r = await create(sb, {
      type: "community_activity",
      dedupeKey: "d1",
      displayPayload: { legacyMeta: { kind: "community_comment" } },
    });
    expect(r.ok).toBe(true);
    expect(inserted[0]?.push_suppressed_reason).toBeNull();
  });

  it("종 표시 끔 → 행을 만들지 않는다", async () => {
    const { sb, inserted } = fakeSb([{ item_key: "community_like", push_enabled: false, inbox_enabled: false, revision: 2 }]);
    const r = await create(sb, {
      type: "community_activity",
      dedupeKey: "d2",
      displayPayload: { legacyMeta: { kind: "community_like" } },
    });
    expect(r).toEqual({ ok: false, error: "admin_item_disabled" });
    expect(inserted).toHaveLength(0);
  });

  it("푸시 끔 → 행은 만들고 푸시 생략 사유 기록 (기존 사유가 있으면 유지)", async () => {
    const { sb, inserted } = fakeSb([{ item_key: "gift_offered", push_enabled: false, inbox_enabled: true, revision: 1 }]);
    await create(sb, {
      type: "community_activity",
      dedupeKey: "d3",
      displayPayload: { legacyMeta: { kind: "gift_transfer_offered" } },
    });
    expect(inserted[0]?.push_suppressed_reason).toBe("admin_item_disabled");
    await create(sb, {
      type: "community_activity",
      dedupeKey: "d4",
      pushSuppressedReason: "muted_room",
      displayPayload: { legacyMeta: { kind: "gift_transfer_offered" } },
    });
    expect(inserted[1]?.push_suppressed_reason).toBe("muted_room");
  });

  it("통화(부재중)는 설정 표를 읽지 않는다 — 표에 끔이 있어도 그대로", async () => {
    const { sb, inserted, tablesRead } = fakeSb([
      { item_key: "call_missed", push_enabled: false, inbox_enabled: false, revision: 1 },
    ]);
    const r = await create(sb, {
      type: "missed_call",
      dedupeKey: "d5",
      displayPayload: { kind: "missed_call" },
    });
    expect(r.ok).toBe(true);
    expect(inserted[0]?.push_suppressed_reason).toBeNull();
    expect(tablesRead).not.toContain("notification_item_settings");
  });

  it("채팅 행은 종 표시를 끌 수 없다(대화 숫자) — 푸시만 끔", async () => {
    const { sb, inserted } = fakeSb([{ item_key: "chat_direct", push_enabled: false, inbox_enabled: false, revision: 1 }]);
    const r = await create(sb, {
      type: "chat_message",
      dedupeKey: "d6",
      chatDomain: "general_direct",
      domainIdentityKey: "general_direct:r1",
      displayPayload: { roomKind: "direct" },
    });
    expect(r.ok).toBe(true);
    expect(inserted[0]?.push_suppressed_reason).toBe("admin_item_disabled");
  });
});

describe("saveNotificationItemSettings", () => {
  it("읽은 revision 과 다르면 409 · 아무것도 쓰지 않는다", async () => {
    const { sb, settingWrites } = fakeSb([{ item_key: "community_like", push_enabled: true, inbox_enabled: true, revision: 3 }]);
    const r = await saveNotificationItemSettings(
      sb,
      [
        { item_key: "community_comment", push_enabled: false, inbox_enabled: true, base_revision: null },
        { item_key: "community_like", push_enabled: false, inbox_enabled: true, base_revision: 2 },
      ],
      "admin1"
    );
    expect(r).toMatchObject({ ok: false, status: 409, item_key: "community_like" });
    expect(settingWrites).toHaveLength(0);
  });

  it("잠긴 항목을 끄려 하면 400 · 모르는 항목 400", async () => {
    const { sb } = fakeSb([]);
    expect(
      await saveNotificationItemSettings(sb, [{ item_key: "call_missed", push_enabled: false, inbox_enabled: true, base_revision: null }], "a")
    ).toMatchObject({ ok: false, status: 400, error: "item_locked" });
    expect(
      await saveNotificationItemSettings(sb, [{ item_key: "nope", push_enabled: true, inbox_enabled: true, base_revision: null }], "a")
    ).toMatchObject({ ok: false, status: 400, error: "unknown_item" });
  });

  it("처음 저장은 revision 1 로 만든다", async () => {
    const { sb, settingWrites } = fakeSb([]);
    const r = await saveNotificationItemSettings(
      sb,
      [{ item_key: "community_like", push_enabled: false, inbox_enabled: true, base_revision: null }],
      "admin1"
    );
    expect(r).toEqual({ ok: true, saved: ["community_like"] });
    expect(settingWrites[0]).toMatchObject({ item_key: "community_like", push_enabled: false, revision: 1, updated_by: "admin1" });
  });
});
