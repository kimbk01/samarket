/**
 * 2026-11-21 메시지 보내기 2단계 — 사본 즉시 재생성 → 「바뀜 표시」 묶음 · 워터마크·대상 묶음.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/message-send-fanout-stage2-design-2026-11-21.md
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => ({ rpc }) }));
const scheduleHome = vi.fn();
const scheduleHub = vi.fn();
vi.mock("@/lib/community-messenger/home-sync-snapshot-refresh", () => ({
  scheduleHomeSyncSnapshotRefresh: (...a: unknown[]) => scheduleHome(...a),
}));
vi.mock("@/lib/chats/hub-badge-snapshot-refresh", () => ({
  scheduleOwnerHubBadgeSnapshotRefresh: (...a: unknown[]) => scheduleHub(...a),
}));
vi.mock("@/lib/push/keep-alive-after-response", () => ({ keepAliveAfterResponse: () => undefined }));

import {
  enqueueMessengerSnapshotDirty,
  flushMessengerSnapshotDirty,
} from "@/lib/community-messenger/messenger-snapshot-dirty";
import { isMessengerSnapshotInvalidated } from "@/lib/community-messenger/messenger-snapshot-invalidated";
import {
  bumpBootstrapSnapshotInvalidationMany,
  hasUnackedBootstrapSnapshotInvalidation,
  clearUnackedBootstrapSnapshotInvalidationForTests,
} from "@/lib/community-messenger/bootstrap-snapshot-invalidation";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  rpc.mockReset();
  scheduleHome.mockReset();
  scheduleHub.mockReset();
  clearUnackedBootstrapSnapshotInvalidationForTests();
});

describe("바뀜 표시 판정", () => {
  it("바뀜 표시가 저장보다 늦을 때만 틀림 · 열 없음/값 없음은 지금 동작", () => {
    expect(isMessengerSnapshotInvalidated({ updated_at: "2026-11-21T00:00:00Z", invalidated_at: "2026-11-21T00:00:01Z" })).toBe(true);
    expect(isMessengerSnapshotInvalidated({ updated_at: "2026-11-21T00:00:02Z", invalidated_at: "2026-11-21T00:00:01Z" })).toBe(false);
    expect(isMessengerSnapshotInvalidated({ updated_at: "2026-11-21T00:00:00Z", invalidated_at: null })).toBe(false);
    expect(isMessengerSnapshotInvalidated({ updated_at: "2026-11-21T00:00:00Z" })).toBe(false);
    expect(isMessengerSnapshotInvalidated(null)).toBe(false);
  });
});

describe("바뀜 표시 묶음 쓰기", () => {
  it("같은 순간 모인 사람 전원을 DB 1번으로 · 즉시 재생성 없음", async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    for (const u of ["a", "b", "c"]) {
      enqueueMessengerSnapshotDirty(u, "home");
      enqueueMessengerSnapshotDirty(u, "hub");
    }
    await flushMessengerSnapshotDirty();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("mark_messenger_snapshots_dirty", {
      p_home_user_ids: ["a", "b", "c"],
      p_hub_user_ids: ["a", "b", "c"],
    });
    expect(scheduleHome).not.toHaveBeenCalled();
    expect(scheduleHub).not.toHaveBeenCalled();
  });

  it("함수 없음·실패면 그 사람들만 기존처럼 즉시 재생성", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    enqueueMessengerSnapshotDirty("a", "home");
    enqueueMessengerSnapshotDirty("b", "hub");
    await flushMessengerSnapshotDirty();
    expect(scheduleHome).toHaveBeenCalledWith("a");
    expect(scheduleHub).toHaveBeenCalledWith("b");
    expect(scheduleHome).toHaveBeenCalledTimes(1);
    expect(scheduleHub).toHaveBeenCalledTimes(1);
  });
});

describe("부트스트랩 워터마크 묶음", () => {
  it("여러 사람은 DB 1번 · 성공 전까지 「확인 안 된 무효화」 유지 · 성공하면 해제", async () => {
    let resolve!: (v: unknown) => void;
    rpc.mockImplementation(() => new Promise((r) => (resolve = r)));
    bumpBootstrapSnapshotInvalidationMany(["u1", "u2", "u3"]);
    expect(hasUnackedBootstrapSnapshotInvalidation("u2")).toBe(true);
    await tick();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("invalidate_cm_bootstrap_snapshot_watermarks", { p_user_ids: ["u1", "u2", "u3"] });
    resolve({ data: 3, error: null });
    await tick();
    expect(hasUnackedBootstrapSnapshotInvalidation("u2")).toBe(false);
  });

  it("묶음 실패면 사람별 기존 경로(같은 RPC 이름 사람마다)", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "invalidate_cm_bootstrap_snapshot_watermarks"
        ? { data: null, error: { message: "function does not exist" } }
        : { data: "2026-11-21T00:00:00Z", error: null }
    );
    bumpBootstrapSnapshotInvalidationMany(["u1", "u2"]);
    for (let i = 0; i < 5; i += 1) await tick();
    const single = rpc.mock.calls.filter((c) => c[0] === "invalidate_cm_bootstrap_snapshot_watermark");
    expect(single.map((c) => (c[1] as { p_user_id: string }).p_user_id).sort()).toEqual(["u1", "u2"]);
  });
});

describe("호출부 · 읽는 쪽 계약", () => {
  it("보내기 뒤 무효화만 바뀜 표시·워터마크 묶음을 쓴다(통화 경로는 기존 함수 기본값)", () => {
    const post = read("lib/community-messenger/server/community-messenger-send-post-ack-effects.ts");
    expect(post).toContain("invalidateHomeSyncSnapshotCache(id, { lazySnapshot: true })");
    expect(post).toContain("invalidateCmBootstrapSnapshotCache(id, { deferWatermark: true })");
    expect(post).toContain("bumpBootstrapSnapshotInvalidationMany(dedupeIds([senderUserId, ...recipientUserIds]))");
    for (const f of [
      "app/api/community-messenger/calls/sessions/[sessionId]/route.ts",
      "lib/community-messenger/call-session-heartbeat.ts",
    ]) {
      let src = "";
      try {
        src = read(f);
      } catch {
        continue;
      }
      expect(src).not.toContain("lazySnapshot");
      expect(src).not.toContain("deferWatermark");
    }
  });

  it("읽는 쪽 3곳이 바뀜 표시를 보면 사본을 쓰지 않는다", () => {
    expect(read("lib/community-messenger/home-sync-snapshot.ts")).toContain('return { hit: false, reason: "stale" };');
    expect(read("lib/chats/owner-hub-badge-snapshot.ts")).toContain(
      "if (isMessengerSnapshotInvalidated(data as unknown as { updated_at?: unknown; invalidated_at?: unknown })) {"
    );
    expect(read("lib/chat/hub-badge-unread-counter.ts")).toContain("isMessengerSnapshotInvalidated(");
  });

  it("다시 만든 사본은 계산 시작 시각으로 저장(계산 중 바뀜 표시 보존)", () => {
    expect(read("lib/community-messenger/home-sync-snapshot.ts").match(/updatedAtIso: computeStartedAt/g)?.length).toBe(2);
    expect(read("lib/chats/owner-hub-badge-snapshot.ts").match(/updatedAtIso: computeStartedAt/g)?.length).toBe(2);
    expect(read("lib/chat/user-chat-unread-parts.ts")).toContain("updatedAtIso: computeStartedAt");
  });

  it("마이그레이션: 기존 함수를 사람마다 그대로 부른다(규칙 이동 없음)", () => {
    const sql = read("supabase/migrations/20271121120000_messenger_send_fanout_stage2.sql");
    expect(sql).toContain("perform public.invalidate_cm_bootstrap_snapshot_watermark(v_id);");
    expect(sql).toContain("v_res := public.upsert_notification_target_unread(");
    expect(sql).toContain("add column if not exists invalidated_at timestamptz");
    expect(sql.match(/security invoker/g)?.length).toBe(3);
  });
});
