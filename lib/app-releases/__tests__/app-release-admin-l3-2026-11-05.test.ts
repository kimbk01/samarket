/**
 * Owner 2026-11-05 앱 출시 알림 L3 — 관리자 「발송 확정」 = 사유 + 대상 버전 재입력 + 감사 기록,
 * 관리자 「동기화」 = 출시 정보 수집만(발송 없음), 6시간 cron 자동 발송은 그대로.
 * 실제 발송 함수는 대역으로 바꿔 운영 회원에게 아무것도 보내지 않는다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: { ok: true as boolean, userId: "admin-1" },
  release: {
    id: "rel-1",
    platform: "android",
    version_name: "1.2.6",
    version_code: 31,
    released_at: "2026-11-05T00:00:00Z",
    notes_ko: null,
    notes_en: null,
    store_url: null,
    rollout_status: "inProgress",
    source: "play_api",
    notified_at: null,
  } as Record<string, unknown>,
  send: vi.fn(),
  preview: vi.fn(),
  sync: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: async () =>
    h.admin.ok ? { ok: true, userId: h.admin.userId } : { ok: false, response: new Response(null, { status: 403 }) },
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...a: unknown[]) => h.audit(...a),
}));
vi.mock("@/lib/app-releases/app-release-sync", () => ({
  loadAppReleaseById: async (_sb: unknown, id: string) => {
    if (id !== h.release.id) throw new Error("app_release_not_found");
    return h.release;
  },
  adminConfirmNotifyRelease: (...a: unknown[]) => h.send(...a),
  previewAdminConfirmNotifyRelease: (...a: unknown[]) => h.preview(...a),
  syncAppReleases: (...a: unknown[]) => h.sync(...a),
}));

import { GET as notifyGET, POST as notifyPOST } from "@/app/api/admin/app-releases/notify/route";
import { POST as syncPOST } from "@/app/api/admin/app-releases/sync/route";
import { ADMIN_ACTION_LEVELS } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  APP_RELEASE_ADMIN_SCREEN_OUTDATED,
  appReleaseConfirmText,
} from "@/lib/app-releases/app-release-notify-policy";

const post = (url: string, body?: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const NOTIFY = "https://x.test/api/admin/app-releases/notify";
const SYNC = "https://x.test/api/admin/app-releases/sync";

beforeEach(() => {
  vi.clearAllMocks();
  h.admin.ok = true;
  h.send.mockResolvedValue({ releaseId: "rel-1", attempted: 3, created: 3, incomplete: false });
  h.preview.mockResolvedValue({ eligible: true, targetCount: 42, maxPerRun: 100 });
  h.sync.mockResolvedValue({ results: [{ platform: "android", inserted: 1, notified: 0, attempted: 0 }] });
});

describe("발송 확정 — L3", () => {
  it("확인 단계 = L3 · 재입력 값 = 대상 버전", () => {
    expect(ADMIN_ACTION_LEVELS.appReleaseNotify).toBe("L3");
    expect(appReleaseConfirmText({ version_name: "1.2.6", version_code: 31 })).toBe("1.2.6 (31)");
    expect(appReleaseConfirmText({ version_name: "1.3", version_code: null })).toBe("1.3");
  });

  it("예전 화면(사유·재입력 없음) → 409 새로고침 안내 · 발송·감사 없음", async () => {
    const res = await notifyPOST(post(NOTIFY, { releaseId: "rel-1", confirm: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(APP_RELEASE_ADMIN_SCREEN_OUTDATED);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("사유 2자 미만 → 400 · 발송 없음", async () => {
    const res = await notifyPOST(post(NOTIFY, { releaseId: "rel-1", confirm: true, reason: " a ", confirmText: "1.2.6 (31)" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("reason_required");
    expect(h.send).not.toHaveBeenCalled();
  });

  it("대상 버전 재입력이 다르면 → 400 · 발송 없음 (다른 출시 이름으로 우회 불가)", async () => {
    for (const confirmText of ["1.2.6", "1.2.5 (30)", "", 31]) {
      const res = await notifyPOST(post(NOTIFY, { releaseId: "rel-1", confirm: true, reason: "출시 확인", confirmText }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("confirm_text_mismatch");
    }
    expect(h.send).not.toHaveBeenCalled();
  });

  it("confirm 없으면 → 400 · 발송 없음", async () => {
    const res = await notifyPOST(post(NOTIFY, { releaseId: "rel-1", reason: "출시 확인", confirmText: "1.2.6 (31)" }));
    expect(res.status).toBe(400);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("관리자 아님 → 403 · 발송 없음", async () => {
    h.admin.ok = false;
    const res = await notifyPOST(post(NOTIFY, { releaseId: "rel-1", confirm: true, reason: "출시 확인", confirmText: "1.2.6 (31)" }));
    expect(res.status).toBe(403);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("사유 + 정확한 재입력 → 1회 발송 · 감사 기록에 사유·재입력 값", async () => {
    const res = await notifyPOST(
      post(NOTIFY, { releaseId: "rel-1", confirm: true, reason: "  Play 전체 출시 확인  ", confirmText: " 1.2.6 (31) " })
    );
    expect(res.status).toBe(200);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0]![1]).toBe(h.release);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0]![2]).toMatchObject({
      actorId: "admin-1",
      targetType: "app_release",
      targetId: "rel-1",
      action: "app_release.notify_confirm",
      after: { reason: "Play 전체 출시 확인", confirmText: "1.2.6 (31)", created: 3 },
    });
  });

  it("미리보기(GET) = 대상 버전·예상 수만 · 발송·감사 없음", async () => {
    const res = await notifyGET(new Request(`${NOTIFY}?releaseId=rel-1`));
    expect(await res.json()).toEqual({ ok: true, confirmText: "1.2.6 (31)", eligible: true, targetCount: 42, maxPerRun: 100 });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe("관리자 동기화 — 수집만, 발송 없음", () => {
  it("예전 화면(본문 없음) → 409 새로고침 안내 · 동기화·발송 없음", async () => {
    const res = await syncPOST(post(SYNC));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(APP_RELEASE_ADMIN_SCREEN_OUTDATED);
    expect(h.sync).not.toHaveBeenCalled();
  });

  it("collect_only → syncAppReleases(notify:false) · 감사 기록", async () => {
    const res = await syncPOST(post(SYNC, { mode: "collect_only" }));
    expect(res.status).toBe(200);
    expect(h.sync).toHaveBeenCalledWith(expect.anything(), { notify: false });
    expect(h.audit.mock.calls[0]![2]).toMatchObject({ action: "app_release.sync", after: { mode: "collect_only" } });
  });

  it("다른 mode 값으로 발송 경로를 열 수 없다", async () => {
    const res = await syncPOST(post(SYNC, { mode: "collect_and_notify" }));
    expect(res.status).toBe(409);
    expect(h.sync).not.toHaveBeenCalled();
  });
});

describe("cron·화면 배선", () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

  it("6시간 cron 은 기존대로 syncAppReleases(sb) — 자동 발송 유지", () => {
    const cron = read("app/api/cron/app-releases-sync/route.ts");
    expect(cron).toContain("await syncAppReleases(sb);");
    expect(cron).not.toContain("notify: false");
  });

  it("관리자 화면: 동기화 본문 collect_only · 발송 확정은 재입력·사유를 API 로 보낸다", () => {
    const ui = read("components/admin/app/AdminAppReleasesStatus.tsx");
    expect(ui).toContain('JSON.stringify({ mode: "collect_only" })');
    expect(ui).toContain("retypeValue: confirmText");
    expect(ui).toContain("reason: confirmed.reason, confirmText");
    expect(ui).toContain("예상 대상 수: 확인하지 못했습니다");
  });

  it("관리자 발송 API 는 notify 라우트 하나 — 다른 관리자 라우트가 발송 함수를 부르지 않는다", () => {
    expect(read("app/api/admin/app-releases/sync/route.ts")).not.toContain("adminConfirmNotifyRelease");
    expect(read("app/api/admin/app-releases/route.ts")).not.toMatch(/adminConfirmNotifyRelease|notifyReleaseFanOut|syncAppReleases/);
  });
});
