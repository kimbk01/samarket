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
import { useClientMemberId } from "@/hooks/use-client-membership-state";

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
  /**
   * 그릴 때 한 번 읽기의 형태들(재감사 B1·V-C1: 삼항·Boolean(…)·여러 줄 useState 도 잡는다).
   * 이벤트·effect 안의 그 순간 읽기(들여쓰기 4칸 이상 `const x = getCurrentUser()` 등)는 잡지 않는다.
   */
  const PATTERNS: RegExp[] = [
    /getHydrationSafeCurrentUser\(/,
    /^ {2}const \w+ = (?:mounted \? )?getCurrentUser\(\)/m,
    /getCurrentUser\(\)\?\.id \?\? "(?:me|session|guest)"/,
    /useState[^;]*?\(\(\) =>[^;]*?getCurrentUser\(\)/,
    /Boolean\(getCurrentUser\(\)/,
    /\? [\w.]+ : getCurrentUser\(\)/,
    /useEffect\(\(\) => set\w+\(get(?:HydrationSafe)?CurrentUser\(\)/, // 마운트 때 한 번 읽기(PR-C · 설계 §7)
  ];
  /** 근거 있는 허용 (설계 v2 §6 제외 목록 · §11 PR-B 구현 기록) */
  const ALLOW: Record<string, string> = {
    "hooks/use-client-membership-state.ts": "회원 상태 SSOT 자체",
    "components/i18n/AppLanguageProvider.tsx": "세션 단계 구독으로 다시 계산(언어 도메인 · 설계 §6 제외)",
    "components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx": "통화 코드 — 통화 규정상 변경 금지(설계 §6 제외)",
    "components/moim/MoimCreateWizard.tsx": "만들기 시트를 열 때 그 순간 읽기(설계 §6 제외)",
    "components/moim/MoimJoinSheet.tsx": "가입 시트를 열 때 기본 별명 그 순간 읽기(설계 §6 제외)",
  };
  /** 설계 §6 표 밖의 같은 종류 — Owner 결정 전 보고만(설계 §11 PR-B 기록). 늘면 실패 */
  const REPORTED_OUT_OF_SCOPE: Record<string, string> = {
    "hooks/useRegionViewerUserId.ts": "지역 도메인 — \"guest\" 대체 키",
    "hooks/use-mypage-home-summary.ts": "내정보 요약 — 삼항 보충 읽기",
    "components/mypage/trust/MypageTrustContent.tsx": "로그인 신호 + 그 순간 읽기",
    "hooks/use-representative-address-line.ts": "주소 도메인 — Boolean(getCurrentUser()) 도우미",
  };

  it("허용 목록 밖에서 0건 (모임 포함 · PR-C)", () => {
    const bad: string[] = [];
    for (const f of [...walk("components"), ...walk("app"), ...walk("hooks")]) {
      if (ALLOW[f] || REPORTED_OUT_OF_SCOPE[f]) continue;
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      if (PATTERNS.some((p) => p.test(src))) bad.push(f);
    }
    expect(bad).toEqual([]);
  });

  it("내정보 5곳은 회원 상태 하나로 — 그릴 때 getCurrentUser 보충 읽기 0 (설계 §6)", () => {
    for (const f of [
      "components/mypage/MypageGuestGate.tsx",
      "components/mypage/myinfo/MyInfoIaCategoryScreen.tsx",
      "components/mypage/MyPageItemRouteClient.tsx",
      "components/trade/MarketplaceSellHubPage.tsx",
    ]) {
      expect(fs.readFileSync(path.join(ROOT, f), "utf8")).not.toContain("getCurrentUser(");
    }
    const my = fs.readFileSync(path.join(ROOT, "app/(main)/my/MyContent.tsx"), "utf8");
    expect(my).not.toMatch(/sessionUser/);
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
let sessionChecks = 0;
let sessionHealth: { ok: boolean; phase: string } = { ok: false, phase: "loading" };
vi.mock("@/lib/auth/dibay-session-manager", () => ({
  ensureSessionHealthy: async () => {
    sessionChecks += 1;
    return sessionHealth;
  },
  subscribeDibayAuthStateChange: () => () => undefined,
  getSessionPhase: () => "loading",
}));
vi.mock("@/lib/auth/resolve-client-profile-session", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/resolve-client-profile-session")>();
  return {
    ...real,
    resolveClientMembership: async () => {
      sessionChecks += 1;
      return { status: "guest" as const };
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  settingsCalls.length = 0;
  sessionChecks = 0;
  sessionHealth = { ok: false, phase: "loading" };
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
    expect(settingsCalls.every((c) => c.userId === ME)).toBe(true);
  });

  it.each([
    ["채팅", "ChatSettingsContent", "@/components/my/settings/ChatSettingsContent"],
    ["알림", "NotificationsSettingsContent", "@/components/my/settings/NotificationsSettingsContent"],
  ])("%s: 확인 중엔 뼈대·설정 호출 0 (재감사 B2: 빈 id 로 설정을 읽어 서버 요청이 두 번 나가던 결함)", async (_n, name, mod) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const m = (await import(mod)) as Record<string, () => import("react").ReactElement>;
    const C = m[name];
    await act(async () => root!.render(<C />));
    expect(settingsCalls).toEqual([]);
    const { setSupabaseProfileCache } = await import("@/lib/auth/supabase-profile-cache");
    await act(async () => setSupabaseProfileCache({ id: ME, email: "", nickname: "me" } as never));
    expect(settingsCalls.length).toBeGreaterThan(0);
    expect(settingsCalls.every((c) => c.userId === ME)).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("회원 상태 — 카드 100장 목록 추가 확인 0 · 첫 화면 캐시 반영 (설계 §6 · 재감사 B5·B1)", () => {
  function Card() {
    const id = useClientMemberId("card");
    return <i data-id={id ?? ""} />;
  }

  it("캐시가 이미 회원이면 첫 렌더부터 회원 id — 확인 중을 거치지 않음(보충 읽기 없이)", async () => {
    const { setSupabaseProfileCache } = await import("@/lib/auth/supabase-profile-cache");
    setSupabaseProfileCache({ id: ME, email: "", nickname: "me" } as never);
    const seen: Array<string | null> = [];
    function Probe() {
      seen.push(useClientMemberId("probe"));
      return null;
    }
    await act(async () => root!.render(<Probe />));
    expect(seen[0]).toBe(ME);
    expect(sessionChecks).toBe(0);
  });

  it("회원: 100장 마운트해도 세션 확인 0", async () => {
    const { setSupabaseProfileCache } = await import("@/lib/auth/supabase-profile-cache");
    setSupabaseProfileCache({ id: ME, email: "", nickname: "me" } as never);
    await act(async () => root!.render(<>{Array.from({ length: 100 }, (_, i) => <Card key={i} />)}</>));
    expect(sessionChecks).toBe(0);
    expect(host!.querySelectorAll(`i[data-id="${ME}"]`).length).toBe(100);
  });

  it("비회원 확정 뒤 100장을 새로 마운트해도 다시 확인하지 않음 (예전: 마운트마다 확인 중→비회원 + 세션 확인 연쇄)", async () => {
    sessionHealth = { ok: true, phase: "ready" }; // 세션은 건강, 회원 확인이 비회원(복구 가능 비회원 경로)
    await act(async () => root!.render(<Card />));
    const mod = await import("@/hooks/use-client-membership-state");
    expect(mod.peekClientMembershipRecoveryForTests().state).toEqual({ status: "guest" });
    const before = sessionChecks;
    let renders = 0;
    const unsub = mod.subscribeClientMembershipStoreForTests(() => {
      renders += 1;
    });
    await act(async () => root!.render(<>{Array.from({ length: 100 }, (_, i) => <Card key={`n${i}`} />)}</>));
    unsub();
    expect(sessionChecks).toBe(before);
    expect(renders).toBe(0);
  });
});

describe("비회원 확정 — 30초 뒤 다음 화면은 다시 확인 · 목록 키 상태 (2차 재감사 1번·키)", () => {
  it("비회원 확정 30초 뒤 붙는 화면은 다시 확인 (프로필 읽기 일시 실패가 비회원으로 굳지 않게)", async () => {
    sessionHealth = { ok: true, phase: "ready" };
    function C() {
      useClientMemberId("c");
      return null;
    }
    await act(async () => root!.render(<C key="a" />));
    const before = sessionChecks;
    const now = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now + 31_000);
    await act(async () => root!.render(<C key="b" />));
    spy.mockRestore();
    expect(sessionChecks).toBeGreaterThan(before);
  });

  it("목록 키: 확인 중 null → 비회원 \"guest\" · 회원 id", async () => {
    const { useClientViewerCacheKey } = await import("@/hooks/use-client-membership-state");
    const seen: Array<string | null> = [];
    function K() {
      seen.push(useClientViewerCacheKey("k"));
      return null;
    }
    sessionHealth = { ok: true, phase: "ready" };
    await act(async () => root!.render(<K />));
    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]).toBe("guest");
    const { setSupabaseProfileCache } = await import("@/lib/auth/supabase-profile-cache");
    await act(async () => setSupabaseProfileCache({ id: ME, email: "", nickname: "me" } as never));
    expect(seen[seen.length - 1]).toBe(ME);
  });
});

describe("차단 API — 옛 토글 닫힘·조회 GET 삭제 (구조 확인 + 동작)", () => {
  it("조회 GET export 없음", () => {
    const src = fs.readFileSync(path.join(ROOT, "app/api/community/block-relations/route.ts"), "utf8");
    expect(src).not.toMatch(/export async function GET/);
    expect(src).toContain('error: "blocked_required"');
  });
});
