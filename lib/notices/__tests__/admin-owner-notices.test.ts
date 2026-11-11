/**
 * 어드민 「배달·매장 › 매장 › 매장 공지」 (설계 v3.2 §3-4 · Owner 2026-11-10).
 * ① 목록 = audience ≠ all 만 · 게시 상태 · 읽음 수(대상 사장님 ∩ 열람 기록, 사람 단위) · 대상 수 · 마지막 알림 결과
 * ② 회원 「앱 공지」 = audience=all 전용 (목록 API 항상 all · 폼에 보는 사람·사장님 알림 없음)
 * ③ 메뉴·권한 = `/admin/stores` 규칙 · 사장님 대상 쓰기 = business 키
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminMenu, collectAdminMenuPathEntries } from "@/components/admin/admin-menu";
import { resolveAdminRouteAccess } from "@/lib/admin/access/admin-route-access";
import {
  ADMIN_OWNER_NOTICES_PATH,
  adminOwnerNoticeEditPath,
  adminOwnerNoticePublishState,
  countOwnerNoticeReaders,
  parseOwnerNoticeNotifyAudit,
} from "@/lib/notices/admin-owner-notices-model";
import { loadAdminOwnerNoticeList, OWNER_NOTICE_NOTIFY_AUDIT_ACTION } from "@/lib/notices/admin-owner-notices.server";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

type Row = Record<string, unknown>;

/** 이 테스트용 최소 PostgREST 흉내 — select/eq/in/is/not/order/limit/range */
function fakeSb(db: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let lo = 0;
      let hi = Number.POSITIVE_INFINITY;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.order = () => q;
      q.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), q);
      q.in = (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q);
      q.is = (c: string, v: unknown) => (filters.push((r) => (v === null ? r[c] == null : r[c] === v)), q);
      q.not = (c: string, op: string, v: unknown) => (filters.push((r) => !(op === "is" && (v === null ? r[c] == null : r[c] === v))), q);
      q.limit = (n: number) => ((hi = n - 1), q);
      q.range = (a: number, b: number) => ((lo = a), (hi = b), q);
      q.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({
          data: (db[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(lo, hi + 1),
          error: null,
        }).then(res);
      return q;
    },
  } as never;
}

const NOW = Date.parse("2026-11-10T04:00:00.000Z");

function notice(id: string, audience: string, extra: Row = {}): Row {
  return {
    id,
    title: `제목 ${id}`,
    audience,
    is_pinned: false,
    is_active: true,
    starts_at: null,
    ends_at: null,
    archived_at: null,
    deleted_at: null,
    published_at: "2026-11-09T00:00:00.000Z",
    created_at: "2026-11-09T00:00:00.000Z",
    ...extra,
  };
}

describe("① 매장 공지 목록 — 모델", () => {
  it("게시 상태: 보관 > 숨김 > 예약 > 종료 > 게시 중", () => {
    expect(adminOwnerNoticePublishState({ is_active: true, archived_at: "x" }, NOW)).toBe("archived");
    expect(adminOwnerNoticePublishState({ is_active: false }, NOW)).toBe("hidden");
    expect(adminOwnerNoticePublishState({ is_active: true, starts_at: "2026-11-11T00:00:00Z" }, NOW)).toBe("scheduled");
    expect(adminOwnerNoticePublishState({ is_active: true, ends_at: "2026-11-01T00:00:00Z" }, NOW)).toBe("ended");
    expect(adminOwnerNoticePublishState({ is_active: true }, NOW)).toBe("live");
  });

  it("읽음 수 = 대상 사장님 중 열람한 사람 수 (같은 사람 여러 날 = 1, 대상 아닌 사람 제외)", () => {
    expect(countOwnerNoticeReaders(["o1", "o1", "o2", "x9"], new Set(["o1", "o2", "o3"]))).toBe(2);
  });

  it("알림 결과 = 감사 로그 after_json 숫자만", () => {
    expect(parseOwnerNoticeNotifyAudit({ recipients: 3, sent: 2, failed: 1 }, "t")).toEqual({
      at: "t",
      recipients: 3,
      sent: 2,
      failed: 1,
    });
    expect(parseOwnerNoticeNotifyAudit({ recipients: "3" }, "t")).toBeNull();
    expect(parseOwnerNoticeNotifyAudit(null, "t")).toBeNull();
  });
});

describe("① 매장 공지 목록 — 서버 조회", () => {
  const db = {
    app_notices: [
      notice("m1", "all"),
      notice("n1", "store_owners", { is_pinned: true }),
      notice("n2", "store_owners_approved"),
      notice("n3", "store_owners", { deleted_at: "2026-11-01T00:00:00Z" }),
    ],
    stores: [
      { id: "s1", owner_user_id: "o1", approval_status: "approved", created_at: "2026-01-01" },
      { id: "s2", owner_user_id: "o2", approval_status: "pending", created_at: "2026-01-02" },
      { id: "s3", owner_user_id: "o3", approval_status: "approved", created_at: "2026-01-03" },
    ],
    customer_center_content_views: [
      { content_id: "n1", user_id: "o1", view_day: "2026-11-09" },
      { content_id: "n1", user_id: "o1", view_day: "2026-11-10" },
      { content_id: "n1", user_id: "o2", view_day: "2026-11-09" },
      { content_id: "n1", user_id: "member9", view_day: "2026-11-09" },
      { content_id: "n2", user_id: "o2", view_day: "2026-11-09" },
      { content_id: "n2", user_id: "o3", view_day: "2026-11-09" },
    ],
    audit_logs: [
      {
        target_type: "app_notice",
        action: OWNER_NOTICE_NOTIFY_AUDIT_ACTION,
        target_id: "n1",
        after_json: { audience: "store_owners", recipients: 3, sent: 3, failed: 0 },
        created_at: "2026-11-10T01:00:00Z",
      },
    ],
  };

  it("audience ≠ all · 삭제 제외 · 읽음/대상 · 알림 결과", async () => {
    const res = await loadAdminOwnerNoticeList(fakeSb(structuredClone(db)), { nowMs: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows.map((r) => r.id)).toEqual(["n1", "n2"]);
    const [n1, n2] = res.rows;
    // n1: 사장님 전체 3명 · 열람 o1(2일)·o2 = 2 · 회원 member9 제외
    expect(n1).toMatchObject({ isPinned: true, audience: "store_owners", targetCount: 3, readCount: 2, publishState: "live" });
    expect(n1!.notify).toEqual({ at: "2026-11-10T01:00:00Z", recipients: 3, sent: 3, failed: 0 });
    // n2: 승인 매장만 = o1·o3 · 열람 o2(심사 중 — 대상 아님)·o3 = 1
    expect(n2).toMatchObject({ audience: "store_owners_approved", targetCount: 2, readCount: 1, notify: null, notifyUnknown: false });
  });

  it("API = 활성 관리자 조회 가드 · 서버 조회 함수 재사용", () => {
    const src = read("app/api/admin/stores/owner-notices/route.ts");
    expect(src).toContain("requireAdminApiUser()");
    expect(src).toContain("loadAdminOwnerNoticeList(sb)");
    expect(src).not.toMatch(/export async function (POST|PATCH|DELETE)/);
    // 대상 수 = 알림 발송과 같은 집계 함수
    expect(read("lib/notices/admin-owner-notices.server.ts")).toContain("collectOwnerAnnouncementRecipients(sb, a)");
  });
});

describe("② 회원 「앱 공지」 = 전체 회원 전용", () => {
  it("목록 API 는 페이지 여부와 상관없이 audience=all 만", () => {
    const src = read("app/api/admin/app-notices/route.ts");
    expect(src).toContain('q = q.eq("audience", APP_NOTICE_MEMBER_AUDIENCE);');
    expect(src).not.toContain('params.get("audience")');
  });

  it("회원 목록·상세 화면에 보는 사람·사장님 알림 없음, 사장님 공지는 매장 공지 수정 화면으로", () => {
    const list = read("components/admin/app/AdminAppNoticesPage.tsx");
    expect(list).not.toContain("admin_app_notice_audience_label");
    expect(list).not.toContain("owner_announcements_pinned");
    const detail = read("components/admin/app/AdminAppNoticeDetailPage.tsx");
    expect(detail).not.toContain("notify-owners");
    expect(detail).toContain("router.replace(adminOwnerNoticeEditPath(id))");
  });

  it("공지 폼: 보는 사람·고정·사장님 알림은 매장 공지 폼만, 회원 새 글 = all", () => {
    const form = read("components/admin/app/AdminAppNoticeForm.tsx");
    expect(form).toContain('{ audience: "all" as const }');
    expect(form).toMatch(/\{isOwner \? \(\s*<>\s*<label className="block space-y-1" data-admin-notice-audience>/);
    expect(form).toContain('OWNER_NOTICE_AUDIENCE_OPTIONS: readonly OwnerAnnouncementAudience[] = ["store_owners", "store_owners_approved"]');
    expect(form).toContain("const notifyOnSave = isOwner && notifyOwners && isSuperAdmin;");
    expect(form).toContain("/notify-owners");
  });
});

describe("③ 메뉴·권한", () => {
  it("배달 › 매장 섹션에 「매장 공지」 leaf (입점 계약 다음)", () => {
    const delivery = adminMenu.find((m) => m.key === "delivery");
    const section = delivery?.children?.find((c) => c.key === "delivery-section-stores");
    const keys = (section?.children ?? []).map((c) => c.key);
    expect(keys.indexOf("store-owner-notices")).toBe(keys.indexOf("store-partner-agreements") + 1);
    expect(collectAdminMenuPathEntries(adminMenu).some((e) => e.path === ADMIN_OWNER_NOTICES_PATH)).toBe(true);
  });

  it("접근표 = `/admin/stores` 규칙 (조회 전원 · 쓰기 business)", () => {
    const stores = resolveAdminRouteAccess("/admin/stores");
    const list = resolveAdminRouteAccess(ADMIN_OWNER_NOTICES_PATH);
    const edit = resolveAdminRouteAccess(adminOwnerNoticeEditPath("n1"));
    expect(list.rule).toEqual(stores.rule);
    expect(edit.rule).toEqual(stores.rule);
    expect(list.rule?.action).toEqual({ kind: "permission", key: "business" });
  });

  it("사장님 대상 작성·수정 API = business 키", () => {
    const post = read("app/api/admin/app-notices/route.ts");
    expect(post).toMatch(/if \(isOwnerAnnouncementAudience\(audience\)\) \{\s*const writer = await requireAdminPermission\("business"\);/);
    const patch = read("app/api/admin/app-notices/[id]/route.ts");
    expect(patch).toMatch(
      /isOwnerAnnouncementAudience\(beforeAudience\) \|\| isOwnerAnnouncementAudience\(body\.audience\)\) \{\s*const writer = await requireAdminPermission\("business"\);/
    );
  });
});
