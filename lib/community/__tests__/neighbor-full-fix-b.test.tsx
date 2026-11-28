// @vitest-environment jsdom
/**
 * 관심이웃 전체 수정 설계 v2 — PR-B (§6·§9)
 * V-C1 확장: 사용자 화면 전체에서 「그릴 때 회원 한 번 읽기」 0 (근거 있는 허용 목록만)
 * 설정 화면: 회원을 모르면 "me" 키로 설정을 읽거나 쓰지 않는다
 * 차단 API: 옛 토글(`blocked` 없음) 400 · 조회 GET 삭제
 */
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = process.cwd();
const ME = "11111111-1111-4111-8111-111111111111";

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "admin" || e.name === "(admin)") continue;
      out.push(...walk(rel));
    } else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

describe("V-C1 확장 — 사용자 화면 전체 (구조 확인)", () => {
  const PATTERN =
    /getHydrationSafeCurrentUser\(|^ {2}const \w+ = (?:mounted \? )?getCurrentUser\(\)|getCurrentUser\(\)\?\.id \?\? "(?:me|session)"|useState[^\n]*\(\(\) => getCurrentUser\(\)/m;
  /** 근거 있는 허용 — 회원 상태 SSOT 를 구독해 다시 그리며 캐시는 첫 화면 보조로만 읽는 곳 등 (설계 v2 §11·PR-B 구현 기록) */
  const ALLOW: Record<string, string> = {
    "hooks/use-client-membership-state.ts": "회원 상태 SSOT 자체",
    "app/(main)/my/MyContent.tsx": "회원 상태 구독 + 캐시는 첫 화면 「확인 중」 깜빡임 방지 보조",
    "components/mypage/MyPageItemRouteClient.tsx": "회원 상태 구독 + 첫 화면 보조",
    "components/mypage/myinfo/MyInfoIaCategoryScreen.tsx": "회원 상태 구독 + 첫 화면 보조",
    "components/i18n/AppLanguageProvider.tsx": "세션 단계 구독으로 다시 계산(언어 도메인)",
    "components/mypage/trust/MypageTrustContent.tsx": "로그인 변경 신호 구독 + 그 순간 읽기",
  };
  /** 다음 단위에서 바꿀 곳 — PR-C(모임) */
  const PENDING_PR_C = (f: string) => f.startsWith("components/moim/");

  it("허용 목록·PR-C 대상 밖에서 0건", () => {
    const bad: string[] = [];
    for (const f of [...walk("components"), ...walk("app"), ...walk("hooks")]) {
      if (ALLOW[f] || PENDING_PR_C(f)) continue;
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      if (PATTERN.test(src)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });

  it("허용 목록 파일은 실제로 회원 상태를 구독하거나 신호를 듣는다(허용 근거가 사라지면 실패)", () => {
    for (const f of ["app/(main)/my/MyContent.tsx", "components/mypage/MyPageItemRouteClient.tsx", "components/mypage/myinfo/MyInfoIaCategoryScreen.tsx"]) {
      expect(fs.readFileSync(path.join(ROOT, f), "utf8")).toContain("useClientMembershipState(");
    }
    expect(fs.readFileSync(path.join(ROOT, "components/mypage/trust/MypageTrustContent.tsx"), "utf8")).toContain(
      "TEST_AUTH_CHANGED_EVENT",
    );
  });
});

/** ── 설정 화면: 회원을 모르면 "me" 키로 읽거나 쓰지 않는다 ── */
const settingsCalls: Array<{ op: string; userId: string }> = [];
vi.mock("@/lib/settings/user-settings-store", () => ({
  getUserSettings: (userId: string) => {
    settingsCalls.push({ op: "get", userId });
    return {};
  },
  syncUserSettings: async (userId: string) => {
    settingsCalls.push({ op: "sync", userId });
    return {};
  },
  subscribeUserSettings: () => () => undefined,
  updateUserSettings: async (userId: string) => {
    settingsCalls.push({ op: "update", userId });
    return true;
  },
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k, language: "ko" }) }));
vi.mock("@/lib/auth/dibay-session-manager", () => ({
  ensureSessionHealthy: async () => ({ ok: false, phase: "loading" }),
  subscribeDibayAuthStateChange: () => () => undefined,
  getSessionPhase: () => "loading",
}));
vi.mock("@/lib/auth/resolve-client-profile-session", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/resolve-client-profile-session")>();
  return { ...real, resolveClientMembership: async () => ({ status: "guest" as const }) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  settingsCalls.length = 0;
  const cache = await import("@/lib/auth/supabase-profile-cache");
  cache.setSupabaseProfileCache(null);
  (await import("@/hooks/use-client-membership-state")).resetClientMembershipStateForTests();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  act(() => root?.unmount());
  host?.remove();
  (await import("@/lib/auth/supabase-profile-cache")).setSupabaseProfileCache(null);
});

describe("설정 화면 — 회원 id 를 알 때만 그 id 로 읽기·동기화 (예전: \"me\" 키)", () => {
  it("개인화: 캐시가 빈 채 그리면 설정 호출 0 → 회원이 되면 실제 id 로만", async () => {
    const { PersonalizationContent } = await import("@/components/my/settings/PersonalizationContent");
    await act(async () => root!.render(<PersonalizationContent />));
    expect(settingsCalls.filter((c) => c.userId === "me")).toEqual([]);
    const { setSupabaseProfileCache } = await import("@/lib/auth/supabase-profile-cache");
    await act(async () => setSupabaseProfileCache({ id: ME, email: "", nickname: "me" } as never));
    expect(settingsCalls.some((c) => c.op === "sync" && c.userId === ME)).toBe(true);
    expect(settingsCalls.every((c) => c.userId === ME || c.userId === "")).toBe(true);
  });
});

describe("차단 API — 옛 토글 닫힘·조회 GET 삭제 (구조 확인 + 동작)", () => {
  it("조회 GET export 없음", () => {
    const src = fs.readFileSync(path.join(ROOT, "app/api/community/block-relations/route.ts"), "utf8");
    expect(src).not.toMatch(/export async function GET/);
    expect(src).toContain('error: "blocked_required"');
  });
});
