import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolveCommunityWriteEditorRollout } from "@/lib/philife/write-editor/write-editor-flag";

const isRouteAdmin = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: () => isRouteAdmin() }));

describe("커뮤니티 새 편집기 플래그 — 일반 회원 비노출", () => {
  const prev = process.env.COMMUNITY_WYSIWYG_EDITOR;
  beforeEach(() => {
    isRouteAdmin.mockReset();
    delete process.env.COMMUNITY_WYSIWYG_EDITOR;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.COMMUNITY_WYSIWYG_EDITOR;
    else process.env.COMMUNITY_WYSIWYG_EDITOR = prev;
  });

  it("env 미설정·알 수 없는 값 = admin (전체 공개 아님)", () => {
    expect(resolveCommunityWriteEditorRollout(undefined)).toBe("admin");
    expect(resolveCommunityWriteEditorRollout("")).toBe("admin");
    expect(resolveCommunityWriteEditorRollout("yes")).toBe("admin");
    expect(resolveCommunityWriteEditorRollout("ON")).toBe("on");
    expect(resolveCommunityWriteEditorRollout("off")).toBe("off");
  });

  it("일반 회원: canOptIn=false (서버 관리자 판정), 관리자: true", async () => {
    const { GET } = await import("@/app/api/philife/write-editor-mode/route");
    isRouteAdmin.mockResolvedValue(false);
    expect(await (await GET()).json()).toEqual({ ok: true, rollout: "admin", canOptIn: false });
    isRouteAdmin.mockResolvedValue(true);
    expect(await (await GET()).json()).toEqual({ ok: true, rollout: "admin", canOptIn: true });
  });

  it("off 이면 관리자도 검증 편집기 사용 불가", async () => {
    process.env.COMMUNITY_WYSIWYG_EDITOR = "off";
    const { GET } = await import("@/app/api/philife/write-editor-mode/route");
    isRouteAdmin.mockResolvedValue(true);
    expect(await (await GET()).json()).toEqual({ ok: true, rollout: "off", canOptIn: false });
  });

  it("클라이언트: 기기 opt-in(localStorage)만으로는 켜지지 않는다 — rollout on 또는 서버 canOptIn 필요", () => {
    const src = readFileSync("lib/philife/write-editor/use-community-write-editor-mode.ts", "utf8");
    expect(src).toContain('state.rollout === "on" || (state.canOptIn && optedIn)');
    const form = readFileSync("components/philife/PhilifeNeighborhoodWriteForm.tsx", "utf8");
    // 토글은 canOptIn 일 때만 렌더, 편집기는 wantWysiwyg 시드가 있을 때만 — 그 외 기존 textarea
    expect(form).toContain("{editorMode.canOptIn ? (");
    expect(form).toMatch(/\{editorSeed \? \([\s\S]*?<PhilifeBodyEditor[\s\S]*?\) : \([\s\S]*?<textarea/);
  });
});
