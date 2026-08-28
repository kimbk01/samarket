import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: vi.fn(async () => true),
}));

vi.mock("@/lib/i18n/config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/i18n/config")>("@/lib/i18n/config");
  return {
    ...actual,
    DEFAULT_APP_LANGUAGE: "ko",
    normalizeAppLanguage: () => "ko",
  };
});

import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { notifyStoreOwnerPointChargeOnHold } from "@/lib/notifications/notify-store-points";
import { OwnerRoutes } from "@/lib/business/owner-routes";

describe("notifyStoreOwnerPointChargeOnHold", () => {
  beforeEach(() => {
    vi.mocked(appendUserNotification).mockClear();
  });

  it("writes owner hold notification via appendUserNotification SSOT", async () => {
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { preferred_language: "ko" } })),
          })),
        })),
      })),
    } as never;

    await notifyStoreOwnerPointChargeOnHold(sb, {
      storeId: "store-1",
      ownerUserId: "owner-1",
      requestId: "req-hold-1",
    });

    expect(appendUserNotification).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({
        user_id: "owner-1",
        notification_type: "commerce",
        domain: "store",
        ref_id: "req-hold-1",
        dedupe_key: "store_point_charge_hold:req-hold-1",
        link_url: OwnerRoutes.points("store-1"),
        meta: expect.objectContaining({
          kind: "store_point_charge_on_hold",
          store_id: "store-1",
          request_id: "req-hold-1",
        }),
      })
    );
  });
});
