// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIBAY_AUTH_BOUND_USER_ID_KEY,
  DIBAY_CLIENT_INSTANCE_ID_KEY,
} from "@/lib/auth/client-instance-id";
import {
  promotionReconcileDoneKey,
  reconcileGuestPromotionLifecycleClient,
} from "@/lib/platform-promotion-lifecycle/client-record-content-visit";
import {
  reconcileGuestPromotionLifecycle,
  suppressionIdentityKey,
  visitIdentityKey,
} from "@/lib/platform-promotion-lifecycle/reconcile-guest-lifecycle";

const USER = "11111111-2222-3333-4444-555555555555";
const DEVICE = "device-abc";

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("reconcileGuestPromotionLifecycleClient — 같은 계정·기기는 성공 1번만", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(DIBAY_CLIENT_INSTANCE_ID_KEY, DEVICE);
    localStorage.setItem(DIBAY_AUTH_BOUND_USER_ID_KEY, USER);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("성공하면 표지를 남기고, 다음 SIGNED_IN(앱 다시 열기)에는 보내지 않는다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    reconcileGuestPromotionLifecycleClient();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(promotionReconcileDoneKey(USER, DEVICE))).toBe("1");

    reconcileGuestPromotionLifecycleClient();
    reconcileGuestPromotionLifecycleClient();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("실패(5xx·ok:false·네트워크)면 표지를 남기지 않아 다음에 다시 보낸다", async () => {
    const responses = [
      new Response(JSON.stringify({ ok: false }), { status: 500 }),
      new Response(JSON.stringify({ ok: false, error: "x" }), { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => {
      const r = responses.shift();
      if (!r) throw new Error("network");
      return r;
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 3; i += 1) {
      reconcileGuestPromotionLifecycleClient();
      await flush();
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem(promotionReconcileDoneKey(USER, DEVICE))).toBeNull();
  });

  it("다른 계정은 표지가 따로라 1번 보낸다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    reconcileGuestPromotionLifecycleClient();
    await flush();
    localStorage.setItem(DIBAY_AUTH_BOUND_USER_ID_KEY, "other-user");
    reconcileGuestPromotionLifecycleClient();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

/** 서버 함수용 최소 Supabase 흉내 — 표별 행 저장, select/eq/is/in/limit 필터, insert 기록 */
function fakeSupabase(tables: Record<string, Record<string, unknown>[]>) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => {
        filters.push((r) => r[col] === v);
        return q;
      },
      is: (col: string, v: unknown) => {
        filters.push((r) => (r[col] ?? null) === v);
        return q;
      },
      in: (col: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[col]));
        return q;
      },
      limit: () => q,
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }),
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        (tables[table] ??= []).push(row);
        return { error: null };
      },
    };
    return q;
  };
  return { sb: { from } as never, inserts };
}

describe("reconcileGuestPromotionLifecycle — 이미 회원에게 있는 행은 다시 넣지 않는다", () => {
  const guestSuppression = {
    user_id: null,
    anonymous_device_key: DEVICE,
    campaign_id: "camp-1",
    mode: "dismiss_today",
    session_key: null,
  };
  const guestVisit = {
    user_id: null,
    anonymous_device_key: DEVICE,
    event_id: "event-1",
    session_key: "sess-1",
    source_channel: "POPUP",
  };

  it("처음 부르면 복사하고, 두 번째 부르면 0건 복사(중복 없음)", async () => {
    const { sb, inserts } = fakeSupabase({
      platform_popup_user_suppressions: [{ ...guestSuppression }],
      platform_promotion_content_visits: [{ ...guestVisit }],
    });
    const first = await reconcileGuestPromotionLifecycle(sb, { userId: USER, anonymousDeviceKey: DEVICE });
    expect(first).toEqual({ ok: true, suppressionsCopied: 1, visitsCopied: 1 });
    const second = await reconcileGuestPromotionLifecycle(sb, { userId: USER, anonymousDeviceKey: DEVICE });
    expect(second).toEqual({ ok: true, suppressionsCopied: 0, visitsCopied: 0 });
    expect(inserts).toHaveLength(2);
  });

  it("손님 행 안의 같은 항목도 1번만 넣는다", async () => {
    const { sb, inserts } = fakeSupabase({
      platform_popup_user_suppressions: [{ ...guestSuppression }, { ...guestSuppression }],
      platform_promotion_content_visits: [{ ...guestVisit }, { ...guestVisit }],
    });
    const r = await reconcileGuestPromotionLifecycle(sb, { userId: USER, anonymousDeviceKey: DEVICE });
    expect(r).toEqual({ ok: true, suppressionsCopied: 1, visitsCopied: 1 });
    expect(inserts).toHaveLength(2);
  });

  it("손님 원본 행은 지우지 않는다(로그아웃 뒤 손님 상태 유지)", async () => {
    const tables = {
      platform_popup_user_suppressions: [{ ...guestSuppression }],
      platform_promotion_content_visits: [{ ...guestVisit }],
    };
    const { sb } = fakeSupabase(tables);
    await reconcileGuestPromotionLifecycle(sb, { userId: USER, anonymousDeviceKey: DEVICE });
    expect(tables.platform_popup_user_suppressions.filter((r) => r.user_id === null)).toHaveLength(1);
    expect(tables.platform_promotion_content_visits.filter((r) => r.user_id === null)).toHaveLength(1);
  });

  it("동일 판정 키 — 세션이 다르면 다른 행", () => {
    expect(suppressionIdentityKey({ campaign_id: "c", mode: "m", session_key: "a" })).not.toBe(
      suppressionIdentityKey({ campaign_id: "c", mode: "m", session_key: "b" })
    );
    expect(visitIdentityKey({ event_id: "e", session_key: "a" })).not.toBe(
      visitIdentityKey({ event_id: "e", session_key: "b" })
    );
  });
});
