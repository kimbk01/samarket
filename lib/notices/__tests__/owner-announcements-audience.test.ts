/**
 * 배달 오픈 4단계 (Owner 승인 설계 2026-11-10) — 사장님 전용 운영 공지.
 * ① 회원 고객센터 경로는 audience=all 만 (사장님 공지 누출 0)
 * ② 사장님 API: 매장 보유자만 · store_owners = 상태 무관 · store_owners_approved = 승인 매장 보유자만
 * ③ 알림: 사장님 1명 = 1건 · 중복 방지 키 · 링크 = 운영 공지 상세 · 기존 운영 알림 kind
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authState = vi.hoisted(() => ({ userId: "u1" as string | null, sb: null as unknown }));

vi.mock("@/lib/auth/api-session", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAuthenticatedUserId: async () =>
      authState.userId
        ? { ok: true, userId: authState.userId }
        : { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) },
  };
});
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => authState.sb,
}));

import { createFakeSupabase } from "@/lib/mypage/__tests__/helpers/fake-postgrest";
import { GET as memberListGET } from "@/app/api/me/settings/notices/route";
import { GET as memberDetailGET } from "@/app/api/me/settings/notices/[noticeId]/route";
import { GET as ownerListGET } from "@/app/api/me/stores/announcements/route";
import { GET as ownerDetailGET } from "@/app/api/me/stores/announcements/[noticeId]/route";
import {
  APP_NOTICE_MEMBER_AUDIENCE,
  isAppNoticeVisibleToMembers,
  ownerAnnouncementAudiencesForStores,
} from "@/lib/notices/app-notice-audience";
import {
  collectOwnerAnnouncementRecipients,
  compareOwnerAnnouncements,
  ownerAnnouncementNotificationBody,
  ownerAnnouncementNotificationDedupeKey,
  sendOwnerAnnouncementNotifications,
} from "@/lib/notices/owner-announcements.server";
import { OWNER_STORE_OPS_NOTICE_META_KINDS } from "@/lib/notifications/owner-store-commerce-notification-meta";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

function row(id: string, audience: string, extra: Record<string, unknown> = {}) {
  const ts = new Date(Date.UTC(2026, 10, 1, 0, 0, 0) + Number(id.replace(/\D/g, "") || 0) * 60_000).toISOString();
  return {
    id,
    content_type: "notice",
    audience,
    is_pinned: false,
    title: `제목 ${id}`,
    body: "본문",
    hero_image_url: null,
    author_label: null,
    is_active: true,
    starts_at: null,
    ends_at: null,
    published_at: ts,
    app_version: null,
    view_count: 0,
    comment_count: 0,
    comment_enabled: true,
    archived_at: null,
    deleted_at: null,
    created_by: null,
    created_at: ts,
    updated_at: ts,
    ...extra,
  };
}

function db(stores: { id: string; owner_user_id: string; approval_status: string }[]) {
  return {
    app_notices: [
      row("n1", "all"),
      row("n2", "store_owners"),
      row("n3", "store_owners_approved"),
      row("n4", "store_owners", { is_pinned: true }),
      row("n5", "store_owners", { is_active: false }),
      row("n6", "store_owners", { ends_at: "2020-01-01T00:00:00.000Z" }),
    ],
    stores,
    customer_center_content_views: [{ content_id: "n2", user_id: "u1" }],
    profiles: [],
  };
}

const ctx = (noticeId: string) => ({ params: Promise.resolve({ noticeId }) });

beforeEach(() => {
  authState.userId = "u1";
  authState.sb = null;
});

describe("① 회원 고객센터 — 사장님 전용 공지 누출 0", () => {
  it("목록은 audience=all 만", async () => {
    authState.sb = createFakeSupabase(db([]));
    const res = await memberListGET(new NextRequest("http://localhost/api/me/settings/notices"));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.notices.map((n: { id: string }) => n.id)).toEqual(["n1"]);
  });

  it("상세: 사장님 공지 id 는 404 (제목도 안 줌)", async () => {
    authState.sb = createFakeSupabase(db([]));
    const res = await memberDetailGET(new Request("http://localhost"), ctx("n2"));
    expect(res.status).toBe(404);
    const j = await res.json();
    expect(JSON.stringify(j)).not.toContain("제목 n2");
  });

  it("회원 조회 경로 전수 — audience 필터 또는 판정이 들어 있다", () => {
    expect(read("app/api/me/settings/notices/route.ts")).toContain('.eq("audience", APP_NOTICE_MEMBER_AUDIENCE)');
    const detail = read("app/api/me/settings/notices/[noticeId]/route.ts");
    expect(detail).toContain("isAppNoticeVisibleToMembers(row)");
    expect(detail.match(/\.eq\("audience", APP_NOTICE_MEMBER_AUDIENCE\)/g)?.length).toBe(2);
    expect(read("app/api/me/settings/notices/[noticeId]/view/route.ts")).toContain("isAppNoticeVisibleToMembers(row)");
    expect(read("app/api/me/settings/notices/[noticeId]/comments/route.ts")).toContain(
      "isAppNoticeVisibleToMembers(content)"
    );
    expect(read("lib/notices/customer-center-read-state.ts")).toContain('.eq("audience", APP_NOTICE_MEMBER_AUDIENCE)');
    // 회원 캠페인 원문 선택(관리자 비페이지 목록) · 발송 판정
    expect(read("app/api/admin/app-notices/route.ts")).toContain('q = q.eq("audience", APP_NOTICE_MEMBER_AUDIENCE)');
    expect(read("lib/admin/notification-campaigns/campaign-source-authority.ts")).toContain(
      'content.audience !== "all"'
    );
  });

  it("isAppNoticeVisibleToMembers — 열 없던 행(undefined)은 all 로 본다", () => {
    expect(APP_NOTICE_MEMBER_AUDIENCE).toBe("all");
    expect(isAppNoticeVisibleToMembers({})).toBe(true);
    expect(isAppNoticeVisibleToMembers({ audience: "all" })).toBe(true);
    expect(isAppNoticeVisibleToMembers({ audience: "store_owners" })).toBe(false);
    expect(isAppNoticeVisibleToMembers({ audience: "store_owners_approved" })).toBe(false);
  });
});

describe("② 사장님 API — 대상 판정", () => {
  it("매장 승인 상태 → 볼 수 있는 대상", () => {
    expect(ownerAnnouncementAudiencesForStores([])).toEqual([]);
    for (const st of ["pending", "under_review", "revision_requested", "suspended", "rejected"]) {
      expect(ownerAnnouncementAudiencesForStores([st])).toEqual(["store_owners"]);
    }
    expect(ownerAnnouncementAudiencesForStores(["pending", "approved"])).toEqual([
      "store_owners",
      "store_owners_approved",
    ]);
  });

  it("매장 없는 회원 → 403", async () => {
    authState.sb = createFakeSupabase(db([]));
    const res = await ownerListGET(new NextRequest("http://localhost/api/me/stores/announcements"));
    expect(res.status).toBe(403);
  });

  it("심사 중 사장님 → store_owners 글만 · 고정 먼저 · 게시 중만 · 읽음 표시", async () => {
    authState.sb = createFakeSupabase(db([{ id: "s1", owner_user_id: "u1", approval_status: "pending" }]));
    const res = await ownerListGET(new NextRequest("http://localhost/api/me/stores/announcements"));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.announcements.map((n: { id: string }) => n.id)).toEqual(["n4", "n2"]);
    expect(j.announcements.find((n: { id: string }) => n.id === "n2").read).toBe(true);
    expect(j.announcements.find((n: { id: string }) => n.id === "n4").read).toBe(false);
  });

  it("승인 매장 사장님 → 승인 전용 글까지 · latest=1 은 고정 무시 최신순", async () => {
    authState.sb = createFakeSupabase(db([{ id: "s1", owner_user_id: "u1", approval_status: "approved" }]));
    const res = await ownerListGET(new NextRequest("http://localhost/api/me/stores/announcements"));
    const j = await res.json();
    expect(j.announcements.map((n: { id: string }) => n.id)).toEqual(["n4", "n3", "n2"]);
    authState.sb = createFakeSupabase(db([{ id: "s1", owner_user_id: "u1", approval_status: "approved" }]));
    const latest = await ownerListGET(new NextRequest("http://localhost/api/me/stores/announcements?latest=1&limit=1"));
    expect((await latest.json()).announcements.map((n: { id: string }) => n.id)).toEqual(["n4"]);
  });

  it("상세: 대상 아닌 글 404 · 전체 회원 글도 404 · 대상 글 200", async () => {
    const stores = [{ id: "s1", owner_user_id: "u1", approval_status: "pending" }];
    authState.sb = createFakeSupabase(db(stores));
    expect((await ownerDetailGET(new Request("http://localhost"), ctx("n3"))).status).toBe(404);
    authState.sb = createFakeSupabase(db(stores));
    expect((await ownerDetailGET(new Request("http://localhost"), ctx("n1"))).status).toBe(404);
    authState.sb = createFakeSupabase(db(stores));
    const ok = await ownerDetailGET(new Request("http://localhost"), ctx("n2"));
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j.notice.title).toBe("제목 n2");
    expect(j.unavailable).toBe(false);
  });

  it("정렬 함수 — 고정 먼저, latestOnly 면 게시일만", () => {
    const a = { id: "a", is_pinned: true, published_at: "2026-01-01T00:00:00Z" };
    const b = { id: "b", is_pinned: false, published_at: "2026-02-01T00:00:00Z" };
    expect([b, a].sort((x, y) => compareOwnerAnnouncements(x, y)).map((x) => x.id)).toEqual(["a", "b"]);
    expect(
      [a, b].sort((x, y) => compareOwnerAnnouncements(x, y, { latestOnly: true })).map((x) => x.id)
    ).toEqual(["b", "a"]);
  });
});

describe("③ 알림 — 사장님 1명 1건 · 중복 방지 · 링크", () => {
  it("대상 사장님 수집: 사장님당 1건, 승인 매장 우선, 승인 전용은 승인 보유자만", async () => {
    const rows = [
      { id: "s1", owner_user_id: "o1", approval_status: "pending", created_at: "2026-01-01" },
      { id: "s2", owner_user_id: "o1", approval_status: "approved", created_at: "2026-02-01" },
      { id: "s3", owner_user_id: "o2", approval_status: "rejected", created_at: "2026-03-01" },
    ];
    const fake = {
      from: () => {
        const q: Record<string, unknown> = {};
        for (const k of ["select", "not", "order"]) q[k] = () => q;
        q.range = async () => ({ data: rows, error: null });
        return q;
      },
    } as never;
    expect(await collectOwnerAnnouncementRecipients(fake, "store_owners")).toEqual([
      { ownerUserId: "o1", storeId: "s2" },
      { ownerUserId: "o2", storeId: "s3" },
    ]);
    expect(await collectOwnerAnnouncementRecipients(fake, "store_owners_approved")).toEqual([
      { ownerUserId: "o1", storeId: "s2" },
    ]);
  });

  it("발송: dedupe 키 = 공지+사장님 · 링크 = 운영 공지 상세 · kind = 기존 운영 알림", async () => {
    const append = vi.fn(async () => true);
    const result = await sendOwnerAnnouncementNotifications(
      {} as never,
      { noticeId: "n2", title: "배달 오픈 안내", body: "## 일정\n**11/20** 오픈", audience: "store_owners", adminActorId: "a1" },
      {
        collect: async () => [
          { ownerUserId: "o1", storeId: "s2" },
          { ownerUserId: "o2", storeId: "s3" },
        ],
        append: append as never,
      }
    );
    expect(result).toEqual({ recipients: 2, sent: 2, failed: 0 });
    const first = (append.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
    expect(first.dedupe_key).toBe(ownerAnnouncementNotificationDedupeKey("n2", "o1"));
    expect(first.dedupe_key).toBe("admin:owner_announcement:n2:o1");
    expect(first.link_url).toBe("/stores/owner/announcements/n2?storeId=s2");
    expect(first.push_kind).toBe("notice");
    const meta = first.meta as Record<string, unknown>;
    expect(OWNER_STORE_OPS_NOTICE_META_KINDS.has(String(meta.kind))).toBe(true);
    expect(meta.store_id).toBe("s2");
    expect(meta.owner_announcement_id).toBe("n2");
  });

  it("발송 실패는 failed 로 센다(중단 없음)", async () => {
    const append = vi.fn(async (_sb: unknown, r: { user_id: string }) => r.user_id !== "o2");
    const result = await sendOwnerAnnouncementNotifications(
      {} as never,
      { noticeId: "n2", title: "t", body: "b", audience: "store_owners", adminActorId: "a1" },
      {
        collect: async () => [
          { ownerUserId: "o1", storeId: "s1" },
          { ownerUserId: "o2", storeId: "s2" },
        ],
        append: append as never,
      }
    );
    expect(result).toEqual({ recipients: 2, sent: 1, failed: 1 });
  });

  it("알림 본문 — 마크다운 기호·이미지 제거", () => {
    expect(ownerAnnouncementNotificationBody("## 일정\n**11/20** 오픈 ![x](https://a/b.png)")).toBe("일정 11/20 오픈");
  });

  it("발송 API = 슈퍼 관리자 전용", () => {
    const src = read("app/api/admin/app-notices/[id]/notify-owners/route.ts");
    expect(src).toContain("requireSuperAdmin()");
    expect(src).toContain("isOwnerAnnouncementAudience(row.audience)");
  });
});
