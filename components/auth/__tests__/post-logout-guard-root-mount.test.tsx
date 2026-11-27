// @vitest-environment jsdom
/**
 * 로그아웃 표시(`samarket:post_logout_guard`) 해제 부품은 루트 레이아웃 1곳 — 서버 콜백 로그인(iOS Google·iOS 카카오·
 * Android Apple·웹)이 가입 단계 화면(`/auth/onboarding/*`, 루트 레이아웃만)에서 부팅을 끝내도 표시를 지운다.
 * 예전: `(main)` 에만 있어 표시가 실행 끝까지 남고 `getCurrentUser()` 가 비어 내정보 카드 스켈레톤 고착·채팅·하트·신고 등이
 * 비회원처럼 동작(Owner iPhone 2026-11-27 08:57, 재시작하면 정상).
 * 근거 `docs/audit/signup-mypage-skeleton-root-cause-2026-11-27.md` · 설계 `signup-mypage-skeleton-fix-design-2026-11-27.md` §6·§8.
 *
 * R1·R2 는 실제 앱 시작(`ensureAppBoot` → `run-app-boot` 프로필 적용)을 돌린다 — 부품이 있으면 값이 채워지고(수정 뒤),
 * 없으면 비어 있다(가입 단계 화면의 예전 상태). T1 이 부품이 루트에 있음을 고정한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UID = "0d08ec52-c77e-45b8-96fd-f8a778633e6e";
const GUARD = "samarket:post_logout_guard";
const PROFILE = { id: UID, nickname: "가입회원", phone_verified: true };

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: UID, email: "new@member.test", user_metadata: {} } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: UID } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  }),
}));

const fetchSpy = vi.fn(async (input: unknown) => {
  const url = String(input);
  if (url.includes("/api/me/profile")) {
    return new Response(JSON.stringify({ ok: true, profile: PROFILE }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
});

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const mounted: Array<ReturnType<typeof createRoot>> = [];
async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => root.render(node));
  return { host, root };
}

afterEach(async () => {
  // 시험 사이 부품·리스너가 남아 다음 시험의 표시를 지우지 않게
  for (const r of mounted.splice(0)) await act(async () => r.unmount());
  document.body.innerHTML = "";
});

describe("T1 PostLogoutBfcacheGuard mount location", () => {
  it("root layout mounts it once, before SupabaseAuthSync; (main) tree no longer mounts it", () => {
    const layout = read("app/layout.tsx");
    expect(layout.match(/<PostLogoutBfcacheGuard \/>/g) ?? []).toHaveLength(1);
    expect(layout.indexOf("<PostLogoutBfcacheGuard />")).toBeLessThan(layout.indexOf("<SupabaseAuthSync />"));
    expect(read("components/layout/MainAppProviderTree.tsx")).not.toContain("PostLogoutBfcacheGuard");
  });
});

describe("after logout (guard set) — real app boot on the onboarding document", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    fetchSpy.mockClear();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    sessionStorage.clear();
    sessionStorage.setItem(GUARD, "1");
  });

  it("R1 guard mounted before boot (root layout) → boot ready clears it and fills the logged-in user", async () => {
    const { PostLogoutBfcacheGuard } = await import("@/components/auth/PostLogoutBfcacheGuard");
    await render(<PostLogoutBfcacheGuard />);
    const { ensureAppBoot } = await import("@/lib/app-boot/run-app-boot");
    await act(async () => {
      await ensureAppBoot();
    });
    const { getCurrentUser } = await import("@/lib/auth/get-current-user");
    const { getAppBootSnapshot } = await import("@/lib/app-boot/app-boot-store");
    expect(getAppBootSnapshot().status).toBe("ready");
    expect(sessionStorage.getItem(GUARD)).toBeNull();
    expect(getCurrentUser()?.id).toBe(UID);
  });

  it("R2 control — no guard component on the page (old /auth/onboarding state) → user stays empty", async () => {
    const { ensureAppBoot } = await import("@/lib/app-boot/run-app-boot");
    await act(async () => {
      await ensureAppBoot();
    });
    const { getCurrentUser } = await import("@/lib/auth/get-current-user");
    const { getAppBootSnapshot } = await import("@/lib/app-boot/app-boot-store");
    expect(getAppBootSnapshot().status).toBe("ready");
    expect(sessionStorage.getItem(GUARD)).toBe("1");
    expect(getCurrentUser()).toBeNull();
  });

  it("T3 MY home model after that boot shows the profile card (no skeleton) and fetches nothing extra for profile", async () => {
    const { PostLogoutBfcacheGuard } = await import("@/components/auth/PostLogoutBfcacheGuard");
    await render(<PostLogoutBfcacheGuard />);
    const { ensureAppBoot } = await import("@/lib/app-boot/run-app-boot");
    await act(async () => {
      await ensureAppBoot();
    });
    const { useMypageHomeModel } = await import("@/hooks/use-mypage-home-model");
    const seen: Array<{ id: string | null; failed: boolean }> = [];
    function Probe() {
      const m = useMypageHomeModel(true);
      seen.push({ id: m.projection?.viewerId ?? null, failed: m.loadFailed || m.needsRelogin });
      return null;
    }
    await render(<Probe />);
    await act(async () => new Promise((r) => setTimeout(r, 300)));
    const last = seen[seen.length - 1]!;
    expect(last.id).toBe(UID);
    expect(last.failed).toBe(false);
  });

  it("T4 anonymous boot ready (logout → login screen) keeps the guard", async () => {
    const { PostLogoutBfcacheGuard } = await import("@/components/auth/PostLogoutBfcacheGuard");
    const boot = await import("@/lib/app-boot/app-boot-store");
    await render(<PostLogoutBfcacheGuard />);
    await act(async () => boot.setAppBootAnonymous());
    expect(sessionStorage.getItem(GUARD)).toBe("1");
  });
});
