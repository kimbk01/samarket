import { describe, expect, it, vi } from "vitest";
import { abandonWriteUploadSessionOnPageHide, createWriteUploadSession } from "@/lib/philife/write-upload-session";
import { shouldShowNoTopicsAdminLink } from "@/lib/philife/write-no-topics";

describe("글쓰기 업로드 세션 — 쓰지 않은 사진 정리 (고아 방지)", () => {
  it("등록 성공: 저장된 사진은 남기고 나머지만 정리", () => {
    const discard = vi.fn();
    const s = createWriteUploadSession(discard);
    s.note("a");
    s.note("b");
    s.note("c");
    s.close(["a", "c"]);
    expect(discard).toHaveBeenCalledTimes(1);
    expect(discard).toHaveBeenCalledWith(["b"]);
  });

  it("업로드 중 나가기: 나간 뒤 끝난 업로드는 바로 정리", () => {
    const discard = vi.fn();
    const s = createWriteUploadSession(discard);
    s.note("a");
    s.close([]);
    expect(discard).toHaveBeenLastCalledWith(["a"]);
    s.note("late");
    expect(discard).toHaveBeenLastCalledWith(["late"]);
  });

  it("작성기가 그냥 사라지면 남은 사진 전부 정리 · 이미 끝난 세션은 다시 정리하지 않음", () => {
    const discard = vi.fn();
    const s = createWriteUploadSession(discard);
    s.note("a");
    s.abandon();
    expect(discard).toHaveBeenCalledWith(["a"]);
    s.abandon();
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("다시 붙으면(개발 재마운트) 세션 재개 — 이후 업로드는 기록만", () => {
    const discard = vi.fn();
    const s = createWriteUploadSession(discard);
    s.abandon();
    s.reopen();
    s.note("x");
    expect(discard).not.toHaveBeenCalled();
    s.close(["x"]);
    expect(discard).not.toHaveBeenCalled();
  });

  it("문서가 내려가면(pagehide · 새로고침·창 닫기) 남은 사진 정리 — 언마운트 정리가 돌지 않는 경로", () => {
    const discard = vi.fn();
    const s = createWriteUploadSession(discard);
    const target = new EventTarget();
    const unbind = abandonWriteUploadSessionOnPageHide(s, target as unknown as Window);
    s.note("a");
    s.note("b");
    target.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: false }));
    expect(discard).toHaveBeenCalledTimes(1);
    expect(discard).toHaveBeenCalledWith(["a", "b"]);
    unbind();
  });

  it("bfcache 보관(persisted)은 돌아올 수 있어 정리하지 않음 · 등록 뒤 pagehide 는 다시 정리하지 않음 · 해제 뒤 반응 없음", () => {
    const discard = vi.fn();
    const s = createWriteUploadSession(discard);
    const target = new EventTarget();
    const unbind = abandonWriteUploadSessionOnPageHide(s, target as unknown as Window);
    s.note("a");
    target.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true }));
    expect(discard).not.toHaveBeenCalled();
    s.close(["a"]);
    target.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: false }));
    expect(discard).not.toHaveBeenCalled();
    unbind();
    const s2 = createWriteUploadSession(discard);
    s2.note("z");
    target.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: false }));
    expect(discard).not.toHaveBeenCalled();
  });
});

describe("주제 0개 관리 링크 — 권한 있는 관리자만 (Owner 확정 2026-11-01)", () => {
  it("privilegedAdmin 만 · 주제가 있으면 누구에게도 없음", () => {
    expect(shouldShowNoTopicsAdminLink(true, { privilegedAdmin: true })).toBe(true);
    expect(shouldShowNoTopicsAdminLink(true, { privilegedAdmin: false })).toBe(false);
    expect(shouldShowNoTopicsAdminLink(true, { role: "admin", is_admin: true })).toBe(false);
    expect(shouldShowNoTopicsAdminLink(true, null)).toBe(false);
    expect(shouldShowNoTopicsAdminLink(true, undefined)).toBe(false);
    expect(shouldShowNoTopicsAdminLink(false, { privilegedAdmin: true })).toBe(false);
  });
});

describe("목록 요약문 SSOT = DB 트리거 (사진 설명 제외 · Owner 승인 2026-11-02)", () => {
  it("마이그레이션이 사진 줄 뒤 설명 줄을 빼고 요약을 만든다", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/20271102010000_community_post_summary_drop_image_captions.sql", "utf8");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.community_posts_set_summary_from_content()");
    expect(sql).toContain("v_block->>'t' = 'img'");
    expect(sql).toMatch(/replace\(v_text, '\(' \|\| v_url \|\| '\)' \|\| E'\\n' \|\| v_caption/);
  });
});

describe("요약 트리거 — 가져온 글 형식(빈 줄 뒤 설명)도 제외 (Owner 승인 2026-11-02)", () => {
  it("줄바꿈 1개·2개 모두 빼고, 설명이 남은 글만 다시 계산", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/20271102040000_community_post_summary_drop_imported_captions.sql", "utf8");
    expect(sql).toContain("E'\\n' || v_caption");
    expect(sql).toContain("E'\\n\\n' || v_caption");
    expect(sql).toMatch(/UPDATE public\.community_posts p\s+SET content = p\.content/);
    expect(sql).toContain("position(b->>'caption' in coalesce(p.summary, '')) > 0");
  });
});
