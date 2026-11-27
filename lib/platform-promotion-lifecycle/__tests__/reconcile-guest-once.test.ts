// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIBAY_AUTH_BOUND_USER_ID_KEY,
  DIBAY_CLIENT_INSTANCE_ID_KEY,
} from "@/lib/auth/client-instance-id";
import {
  notePromotionDeviceStateWrite,
  promotionReconcileDoneKey,
  reconcileGuestPromotionLifecycleClient,
} from "@/lib/platform-promotion-lifecycle/client-record-content-visit";
import {
  MEMBER_ROW_MAX_PAGES,
  MEMBER_ROW_PAGE_SIZE,
  reconcileGuestPromotionLifecycle,
  suppressionIdentityKey,
  visitIdentityKey,
} from "@/lib/platform-promotion-lifecycle/reconcile-guest-lifecycle";

const USER = "11111111-2222-3333-4444-555555555555";
const DEVICE = "device-abc";

/** fetch → then → json → finally 사슬이 모두 끝날 때까지 */
async function flush(): Promise<void> {
  for (let i = 0; i < 3; i += 1) await new Promise((r) => setTimeout(r, 0));
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
    expect(localStorage.getItem(promotionReconcileDoneKey(USER, DEVICE))).toBe("0");

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

  it("기기에 새 숨김·방문 기록이 생기면(세션 만료 뒤 손님 기록 포함) 다음 로그인 이벤트에 1번 다시 보낸다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    reconcileGuestPromotionLifecycleClient();
    await flush();
    notePromotionDeviceStateWrite();
    reconcileGuestPromotionLifecycleClient();
    await flush();
    reconcileGuestPromotionLifecycleClient();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("응답 전에 겹쳐 온 로그인 이벤트는 보내지 않는다(동시 복사 방지)", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    reconcileGuestPromotionLifecycleClient();
    reconcileGuestPromotionLifecycleClient();
    reconcileGuestPromotionLifecycleClient();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await flush();
    reconcileGuestPromotionLifecycleClient();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("보내는 사이 새 기록이 생기면 그 전 순번이 남아 다음에 1번 더 보낸다", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    reconcileGuestPromotionLifecycleClient();
    notePromotionDeviceStateWrite();
    resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await flush();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    reconcileGuestPromotionLifecycleClient();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    let rangeFrom = 0;
    let rangeTo = Number.POSITIVE_INFINITY;
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
      order: () => q,
      range: (a: number, b: number) => {
        rangeFrom = a;
        rangeTo = b;
        return q;
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({
          data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(rangeFrom, rangeTo + 1),
          error: null,
        }),
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
    mode: "TODAY",
    session_key: null,
    suppress_until: "2026-11-27T16:00:00+00:00",
    campaign_revision: null,
    timezone: "Asia/Manila",
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

  it("기한이 다른 숨김(예: 지난주 「오늘 숨김」)이 회원에게 있어도 새 숨김은 넣는다", async () => {
    const { sb, inserts } = fakeSupabase({
      platform_popup_user_suppressions: [
        { ...guestSuppression },
        { ...guestSuppression, user_id: USER, anonymous_device_key: null, suppress_until: "2026-11-20T16:00:00+00:00" },
      ],
      platform_promotion_content_visits: [],
    });
    const r = await reconcileGuestPromotionLifecycle(sb, { userId: USER, anonymousDeviceKey: DEVICE });
    expect(r).toEqual({ ok: true, suppressionsCopied: 1, visitsCopied: 0 });
    expect(inserts).toHaveLength(1);
  });

  it("같은 순간이면 시각 표기가 달라도 같은 행으로 본다", async () => {
    const { sb, inserts } = fakeSupabase({
      platform_popup_user_suppressions: [
        { ...guestSuppression },
        { ...guestSuppression, user_id: USER, anonymous_device_key: null, suppress_until: "2026-11-27T16:00:00.000Z" },
      ],
      platform_promotion_content_visits: [],
    });
    const r = await reconcileGuestPromotionLifecycle(sb, { userId: USER, anonymousDeviceKey: DEVICE });
    expect(r).toEqual({ ok: true, suppressionsCopied: 0, visitsCopied: 0 });
    expect(inserts).toHaveLength(0);
  });

  it("회원 기존 행이 1,000행을 넘어도 끝까지 읽어 중복을 넣지 않는다", async () => {
    const memberRows = Array.from({ length: MEMBER_ROW_PAGE_SIZE + 5 }, (_, i) => ({
      ...guestSuppression,
      user_id: USER,
      anonymous_device_key: null,
      suppress_until: i === MEMBER_ROW_PAGE_SIZE + 4 ? guestSuppression.suppress_until : `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
    }));
    const { sb, inserts } = fakeSupabase({
      platform_popup_user_suppressions: [...memberRows, { ...guestSuppression }],
      platform_promotion_content_visits: [],
    });
    const r = await reconcileGuestPromotionLifecycle(sb, { userId: USER, anonymousDeviceKey: DEVICE });
    expect(r).toEqual({ ok: true, suppressionsCopied: 0, visitsCopied: 0 });
    expect(inserts).toHaveLength(0);
  });

  it("회원 기존 행이 상한을 넘으면 넣지 않고 실패로 끝낸다(다 확인 못 한 채 넣지 않음)", async () => {
    const memberRows = Array.from({ length: MEMBER_ROW_PAGE_SIZE * MEMBER_ROW_MAX_PAGES }, () => ({
      ...guestSuppression,
      user_id: USER,
      anonymous_device_key: null,
      suppress_until: "2026-01-01T00:00:00Z",
    }));
    const { sb, inserts } = fakeSupabase({
      platform_popup_user_suppressions: [...memberRows, { ...guestSuppression }],
      platform_promotion_content_visits: [],
    });
    const r = await reconcileGuestPromotionLifecycle(sb, { userId: USER, anonymousDeviceKey: DEVICE });
    expect(r).toEqual({ ok: false, error: "member_rows_over_limit" });
    expect(inserts).toHaveLength(0);
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
