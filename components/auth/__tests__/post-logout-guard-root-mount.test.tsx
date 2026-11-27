// @vitest-environment jsdom
/**
 * 로그아웃 표시(`samarket:post_logout_guard`) 해제 부품은 루트 레이아웃 1곳 — 서버 콜백 로그인(iOS Google·iOS 카카오·
 * Android Apple·웹)이 가입 단계 화면(`/auth/onboarding/*`, 루트 레이아웃만)에서 부팅을 끝내도 표시를 지운다.
 * 예전: `(main)` 에만 있어 표시가 실행 끝까지 남고 `getCurrentUser()` 가 비어 내정보 카드 스켈레톤 고착·채팅·하트·신고 등이
 * 비회원처럼 동작(Owner iPhone 2026-11-27 08:57, 재시작하면 정상).
 * 근거 `docs/audit/signup-mypage-skeleton-root-cause-2026-11-27.md` · 설계 v2 `signup-mypage-skeleton-fix-design-2026-11-27.md` §6 T1~T6.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => null }));

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const GUARD = "samarket:post_logout_guard";
const UID = "user-after-signup";

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

describe("after logout (guard set)", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    sessionStorage.clear();
    sessionStorage.setItem(GUARD, "1");
  });

  it("T2 server-callback signup: root guard clears on authenticated boot ready → user cache can be filled", async () => {
    const { PostLogoutBfcacheGuard } = await import("@/components/auth/PostLogoutBfcacheGuard");
    const cache = await import("@/lib/auth/supabase-profile-cache");
    const boot = await import("@/lib/app-boot/app-boot-store");
    const { getCurrentUser } = await import("@/lib/auth/get-current-user");
    await render(<PostLogoutBfcacheGuard />); // 루트 — 가입 단계 문서에서도 부팅 전에 붙음
    cache.setSupabaseProfileCache({ id: UID } as never); // 부팅 첫 시도 — 막힘
    expect(getCurrentUser()).toBeNull();
    await act(async () => boot.setAppBootProfile({ id: UID } as never));
    expect(sessionStorage.getItem(GUARD)).toBeNull();
    cache.setSupabaseProfileCache({ id: UID } as never); // SupabaseAuthSync 준비 신호 처리(사용자 확인 뒤)
    expect(getCurrentUser()?.id).toBe(UID);
  });

  it("T3 MY home model mounted first (empty user) starts profile/address fetch once the user cache is filled + auth-changed", async () => {
    const fetchSpy = vi.fn(async (..._a: unknown[]) => new Response("{}", { status: 500 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const { PostLogoutBfcacheGuard } = await import("@/components/auth/PostLogoutBfcacheGuard");
    const cache = await import("@/lib/auth/supabase-profile-cache");
    const boot = await import("@/lib/app-boot/app-boot-store");
    const { dispatchTestAuthChanged } = await import("@/lib/auth/test-auth-store");
    const { useMypageHomeModel } = await import("@/hooks/use-mypage-home-model");
    await render(<PostLogoutBfcacheGuard />);
    function Probe() {
      useMypageHomeModel(true);
      return null;
    }
    await render(<Probe />);
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    const urls = () => fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls().filter((u) => /api\/me\/(profile|address-defaults)/.test(u))).toEqual([]); // 값 없음 → 대기
    await act(async () => boot.setAppBootProfile({ id: UID } as never)); // 부팅 준비 → 표시 삭제
    await act(async () => {
      cache.setSupabaseProfileCache({ id: UID } as never);
      dispatchTestAuthChanged(); // SupabaseAuthSync 가 값을 넣은 뒤 보내는 신호
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(urls().some((u) => u.includes("/api/me/address-defaults"))).toBe(true);
  });

  it("T4 anonymous boot ready (logout → login screen) keeps the guard", async () => {
    const { PostLogoutBfcacheGuard } = await import("@/components/auth/PostLogoutBfcacheGuard");
    const boot = await import("@/lib/app-boot/app-boot-store");
    await render(<PostLogoutBfcacheGuard />);
    await act(async () => boot.setAppBootAnonymous());
    expect(sessionStorage.getItem(GUARD)).toBe("1");
  });

  it("T5 in-app login completion path (clearPostLogoutBfcacheGuard) still lets the cache fill", async () => {
    const wipe = await import("@/lib/auth/client-session-wipe");
    const cache = await import("@/lib/auth/supabase-profile-cache");
    const { getCurrentUser } = await import("@/lib/auth/get-current-user");
    wipe.clearPostLogoutBfcacheGuard();
    cache.setSupabaseProfileCache({ id: UID } as never);
    expect(getCurrentUser()?.id).toBe(UID);
  });
});

describe("T6 post detail ⋯ hide author runs once when the user value exists", () => {
  it("calls blockUser once without re-entering the login gate", async () => {
    vi.resetModules();
    sessionStorage.clear();
    const blockUser = vi.fn(async () => undefined);
    const requireAction = vi.fn(async () => true);
    vi.doMock("@/lib/reports/user-blocks-client", () => ({ blockUser }));
    vi.doMock("@/hooks/use-require-auth-action", () => ({ useRequireAuthAction: () => requireAction }));
    vi.doMock("@/components/i18n/AppLanguageProvider", () => ({
      useI18n: () => ({ t: (k: string) => k, safeT: (k: string) => k }),
    }));
    vi.doMock("@/components/ui/dibay-overlay", () => ({
      dibayAlert: vi.fn(async () => undefined),
      DibayBottomSheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      DibayOverlayButton: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
        <button type="button" onClick={onClick}>
          {children}
        </button>
      ),
    }));
    const cache = await import("@/lib/auth/supabase-profile-cache");
    cache.setSupabaseProfileCache({ id: UID } as never);
    const { PostDetailMoreBottomSheet } = await import("@/components/post/PostDetailMoreBottomSheet");
    const { host } = await render(
      <PostDetailMoreBottomSheet open onClose={() => {}} onSelectReport={() => {}} authorUserId="author-1" />,
    );
    const hide = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("popup_menu_hide_author_posts"));
    await act(async () => {
      hide!.click();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(blockUser).toHaveBeenCalledTimes(1);
    expect(requireAction).not.toHaveBeenCalled();
  });
});
