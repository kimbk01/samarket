import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 순서 5 — 알림·배지 연쇄 (docs/audit/supabase-request-fanout-full-root-cause-2026-11-01.md §12).
 */
const refreshRpc = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => null));
vi.mock("@/lib/notifications/owner-dashboard-notifications-snapshot", () => ({
  refreshOwnerDashboardNotificationsSnapshotFromRpc: refreshRpc,
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({}),
}));

import { fetchNotificationEventsForInbox } from "@/lib/notifications/inbox-events-merge";
import { scheduleOwnerDashboardNotificationsSnapshotRefreshForUser } from "@/lib/notifications/owner-dashboard-notifications-snapshot-refresh";
import {
  invalidateOwnerHubStoreLookupCache,
  writeOwnerHubStoreLookupMemory,
} from "@/lib/chats/owner-hub-store-lookup-cache";
import {
  invalidateNotificationSoundSsotReadCache,
  loadNotificationSoundSsotCached,
} from "@/lib/notifications/load-notification-sound-ssot-server";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

function recordingClient(rows: Record<string, unknown>[] = []) {
  const calls: Array<[string, ...unknown[]]> = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "or", "is", "order"]) {
    q[m] = (...a: unknown[]) => (calls.push([m, ...a]), q);
  }
  q.range = async (...a: unknown[]) => (calls.push(["range", ...a]), { data: rows, error: null });
  return { sb: { from: () => q } as never, calls };
}

describe("E3 종 목록 — DB 에서 반드시 빠지는 행만 미리 제외", () => {
  it("항상 숨김 type 제외 + 채팅 제외 목록이면 채팅 조건(or)", async () => {
    const { sb, calls } = recordingClient();
    await fetchNotificationEventsForInbox(sb, "u1", { fetchUpper: 80, excludeOwnerList: true, excludeChatMessageList: true });
    const not = calls.find((c) => c[0] === "not");
    expect(not?.[1]).toBe("type");
    expect(String(not?.[3])).toContain("incoming_call_signal");
    expect(String(not?.[3])).toContain("admin_test");
    const or = calls.find((c) => c[0] === "or");
    expect(String(or?.[1])).toContain("type.not.in.(chat_message,group_message,mention_message,pin_message,store_order_message,trade_message)");
    expect(String(or?.[1])).toContain('display_payload->>legacyNotificationType.not.in.("",chat)');
  });

  it("채팅 포함 목록 · 오너 매장 목록은 채팅 조건 없음", async () => {
    const a = recordingClient();
    await fetchNotificationEventsForInbox(a.sb, "u1", { fetchUpper: 80, excludeChatMessageList: false });
    expect(a.calls.some((c) => c[0] === "or")).toBe(false);
    const b = recordingClient();
    await fetchNotificationEventsForInbox(b.sb, "u1", { fetchUpper: 80, excludeChatMessageList: true, ownerStoreId: "s1" });
    expect(b.calls.some((c) => c[0] === "or")).toBe(false);
  });

  it("목록 라우트: 채울 목표 = 응답 80 (회원) · unread_total 은 요청 시에만", () => {
    const route = src("app/api/me/notifications/route.ts");
    expect(route).toContain("let fetchUpper = ownerStoreId ? 220 : 80;");
    expect(route).toContain('searchParams.get("unread_total") === "1"');
  });
});

describe("E1·E2 종 패널·실시간 브리지", () => {
  it("브리지: INSERT 즉시 발송 없음 — 1.2초 묶음 1곳에서만 발송", () => {
    const bridge = src("components/notifications/NotificationsBadgeRealtimeBridge.tsx");
    expect(bridge.match(/dispatchEvent\(new Event\(KASAMA_NOTIFICATIONS_UPDATED\)\)/g)?.length).toBe(1);
  });

  it("종 패널: 닫혀 있으면(회원) 목록을 받지 않고 표시만 · 열 때 1회", () => {
    const inbox = src("components/philife/PhilifeHeaderNotificationInbox.tsx");
    expect(inbox).toContain("if (!openRef.current && !ownerInboxStoreId) {");
    expect(inbox).toContain("inboxDirtyRef.current = true;");
    expect(inbox).toContain("}, [open, loadInbox]);");
    expect(inbox).not.toContain("}, [open, listSynced, loadInbox]);");
  });
});

describe("E6 오너 알림 스냅샷 미리 갱신", () => {
  beforeEach(() => {
    refreshRpc.mockClear();
    invalidateOwnerHubStoreLookupCache("u-nostore");
    invalidateOwnerHubStoreLookupCache("u-owner");
    invalidateOwnerHubStoreLookupCache("u-unknown");
  });

  it("매장 없음으로 막 확인된 사용자 → owner_unread 갱신 안 함", async () => {
    writeOwnerHubStoreLookupMemory("u-nostore", null);
    scheduleOwnerDashboardNotificationsSnapshotRefreshForUser("u-nostore");
    await Promise.resolve();
    expect(refreshRpc).not.toHaveBeenCalled();
  });

  it("매장 있음 · 모름 → 지금처럼 갱신", async () => {
    writeOwnerHubStoreLookupMemory("u-owner", { id: "s1", slug: "s", allowed_to_sell: true, sales_status: "approved" } as never);
    scheduleOwnerDashboardNotificationsSnapshotRefreshForUser("u-owner");
    scheduleOwnerDashboardNotificationsSnapshotRefreshForUser("u-unknown");
    await Promise.resolve();
    await Promise.resolve();
    const kinds = refreshRpc.mock.calls.map((c) => [c[1], c[3]]);
    expect(kinds).toEqual([
      ["u-owner", "owner_unread"],
      ["u-unknown", "owner_unread"],
    ]);
  });
});

describe("E7 소리 설정 서버 기억", () => {
  it("60초 안 두 번째 읽기는 DB 0 · 관리자 저장 무효화 후 다시 읽음", async () => {
    let tableReads = 0;
    const sb = {
      from: () => ({
        select: async () => {
          tableReads++;
          return { data: [], error: null };
        },
      }),
    } as never;
    invalidateNotificationSoundSsotReadCache();
    await loadNotificationSoundSsotCached(sb);
    expect(tableReads).toBe(3);
    await loadNotificationSoundSsotCached(sb);
    expect(tableReads).toBe(3);
    invalidateNotificationSoundSsotReadCache();
    await loadNotificationSoundSsotCached(sb);
    expect(tableReads).toBe(6);
  });

  it("관리자 저장·업로드 라우트가 무효화를 부른다", () => {
    expect(src("app/api/admin/notification-sound-ssot/route.ts")).toContain("invalidateNotificationSoundSsotReadCache();");
    expect(src("app/api/admin/notification-sound-ssot/upload/route.ts")).toContain("invalidateNotificationSoundSsotReadCache();");
  });
});
