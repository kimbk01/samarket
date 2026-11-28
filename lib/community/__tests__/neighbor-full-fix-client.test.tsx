// @vitest-environment jsdom
/**
 * 관심이웃 전체 수정 설계 v2 — 화면 쪽 실패 재현 (docs/audit/interest-neighbor-full-fix-design-2026-11-28.md §8)
 * V-MS 회원 상태 · V-D1 차단 버튼 반복 · V-D7 공개 프로필 버튼 · V-D6 저장소 계정 전환
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/types/profile";

const ME = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

/** 세션 확인은 「확인 중」으로 머문다 — 캐시가 늦게 차는 주소 직접 열기 상황 */
vi.mock("@/lib/auth/dibay-session-manager", () => ({
  ensureSessionHealthy: async () => ({ ok: false, phase: "loading" }),
  subscribeDibayAuthStateChange: () => () => undefined,
  getSessionPhase: () => "loading",
}));
vi.mock("@/lib/auth/resolve-client-profile-session", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/resolve-client-profile-session")>();
  return { ...real, resolveClientMembership: async () => ({ status: "guest" as const }) };
});
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
vi.mock("@/components/ui/dibay-overlay", () => ({ dibayConfirm: async () => true }));
vi.mock("@/lib/posts/getPostsForHome", () => ({ invalidateHomePostsCache: () => undefined }));
/** 로그인 요청: 캐시에 회원이 있으면 다음 동작을 바로 부른다(실제 requireAuthAction 과 같은 흐름) — 반복 호출을 세려고 5회에서 멈춤 */
const requireActionCalls: string[] = [];
vi.mock("@/hooks/use-require-auth-action", () => ({
  useRequireAuthAction: () => async (type: string, next: () => unknown) => {
    requireActionCalls.push(type);
    if (requireActionCalls.length > 5) return false;
    const { getCurrentUser } = await import("@/lib/auth/get-current-user");
    if (!getCurrentUser()?.id) return false;
    await next();
    return true;
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const profile = (id = ME): Profile => ({ id, email: "", nickname: "me", display_name: "me" }) as Profile;

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let fetchCalls: Array<{ url: string; body: unknown; method: string }> = [];

async function resetAll() {
  const cache = await import("@/lib/auth/supabase-profile-cache");
  cache.setSupabaseProfileCache(null);
  const ms = await import("@/hooks/use-client-membership-state");
  ms.resetClientMembershipStateForTests();
  const store = await import("@/lib/community/neighbor-follow-store");
  (store as { __resetNeighborFollowStoreForTests?: () => void }).__resetNeighborFollowStoreForTests?.();
}

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  requireActionCalls.length = 0;
  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      fetchCalls.push({ url: String(url), body, method: init?.method ?? "GET" });
      if (String(url).includes("block-relations") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true, blocked: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, following: false, blocked: false }), { status: 200 });
    }),
  );
  await resetAll();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  await resetAll();
});

describe("V-MS 회원 상태 — 캐시가 신호 없이 늦게 차도 회원으로 바뀐다", () => {
  it("확인 중 → 캐시 채움 → member (예전: 확인 중에 머묾)", async () => {
    const { useClientMembershipState } = await import("@/hooks/use-client-membership-state");
    function Probe() {
      const s = useClientMembershipState("test-probe");
      return <span>{s.status === "member" ? `member:${s.profile.id}` : s.status}</span>;
    }
    await act(async () => root!.render(<Probe />));
    expect(host!.textContent).not.toBe(`member:${ME}`);
    const { setSupabaseProfileCache } = await import("@/lib/auth/supabase-profile-cache");
    await act(async () => setSupabaseProfileCache(profile()));
    expect(host!.textContent).toBe(`member:${ME}`);
  });
});

describe("V-D1 공개 프로필 [차단] — 캐시가 늦게 차도 한 번만 로그인 확인·한 번만 차단 요청", () => {
  it("예전: 낡은 toggle 이 requireAction 을 끝없이 다시 부름", async () => {
    const { UserBlockButton } = await import("@/components/community/UserBlockButton");
    await act(async () => root!.render(<UserBlockButton targetUserId={PEER} />));
    const { setSupabaseProfileCache } = await import("@/lib/auth/supabase-profile-cache");
    await act(async () => setSupabaseProfileCache(profile()));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const btn = host!.querySelector("button");
    expect(btn).toBeTruthy();
    await act(async () => {
      btn!.click();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(requireActionCalls.length).toBeLessThanOrEqual(1);
    const posts = fetchCalls.filter((c) => c.url.includes("block-relations") && c.method === "POST");
    expect(posts).toHaveLength(1);
    /** 차단 요청은 원하는 상태를 보낸다(토글 아님) */
    expect(posts[0].body).toEqual({ targetUserId: PEER, blocked: true });
  });
});

describe("V-D7 공개 프로필 관심이웃 버튼 — 비회원·확인 중·본인에게 숨김", () => {
  it("확인 중·비회원이면 isPeer=false (예전: true)", async () => {
    const { useNeighborFollowToggle } = await import("@/components/community/ui/NeighborFollowButton");
    function Probe({ target }: { target: string }) {
      const a = useNeighborFollowToggle({ targetUserId: target, name: "x" });
      return <span>{`${a.isPeer}:${a.isSignedIn}`}</span>;
    }
    await act(async () => root!.render(<Probe target={PEER} />));
    expect(host!.textContent).toBe("false:false");
    const { setSupabaseProfileCache } = await import("@/lib/auth/supabase-profile-cache");
    await act(async () => setSupabaseProfileCache(profile()));
    expect(host!.textContent).toBe("true:true");
    await act(async () => root!.render(<Probe target={ME} />));
    expect(host!.textContent).toBe("false:true");
  });
});

describe("V-D6 저장소 — 계정이 바뀐 뒤 도착한 이전 계정 응답은 버린다", () => {
  it("A 로 읽기 시작 → B 로 전환 → A 응답 도착 → 값 없음(모름)", async () => {
    /** 관계 조회 요청(1개 또는 2개)을 붙잡아 두었다가 계정 전환 뒤에 한꺼번에 응답 */
    const pending: Array<(v: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            pending.push(r);
          }),
      ),
    );
    const store = await import("@/lib/community/neighbor-follow-store");
    const { setSupabaseProfileCache } = await import("@/lib/auth/supabase-profile-cache");
    setSupabaseProfileCache(profile(ME));
    store.ensureNeighborStoreViewer(ME);
    function Probe() {
      const s = store.useNeighborRelation(OTHER);
      return <span>{String(s.following)}</span>;
    }
    await act(async () => root!.render(<Probe />));
    /** 이전 계정(ME)으로 보낸 요청만 붙잡아 둔다 */
    const beforeSwitch = pending.splice(0);
    expect(beforeSwitch.length).toBeGreaterThan(0);
    await act(async () => {
      setSupabaseProfileCache(profile(PEER));
      store.ensureNeighborStoreViewer(PEER);
    });
    await act(async () => {
      for (const r of beforeSwitch) {
        r(new Response(JSON.stringify({ ok: true, following: true, blocked: false }), { status: 200 }));
      }
      await new Promise((r) => setTimeout(r, 0));
    });
    /** 이전 계정 응답(관심이웃 true)은 버려지고, 새 계정으로 다시 읽기 요청이 나갔다 */
    expect(store.readNeighborRelation(OTHER).following).not.toBe(true);
    expect(pending.length).toBeGreaterThan(0);
  });
});
