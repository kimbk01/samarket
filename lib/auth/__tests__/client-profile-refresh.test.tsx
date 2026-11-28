// @vitest-environment jsdom
/**
 * 로그인 정보 캐시가 화면보다 늦게 차도 화면이 다시 그려진다 — 설계 `docs/audit/community-detail-viewer-refresh-design-2026-11-28.md`.
 * 결함(2026-11-28 iPhone 실기): 글 상세를 주소로 바로 열면 캐시가 차기 전에 그려져 로그인 정보가 빈 값으로 남고,
 * 관심이웃 안내 상자가 사라지고 댓글 입력줄 아바타가 「?」였다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/types/profile";
import {
  getSupabaseProfileCache,
  patchSupabaseProfileCache,
  setSupabaseProfileCache,
  subscribeSupabaseProfileCache,
} from "@/lib/auth/supabase-profile-cache";
import { useClientProfile } from "@/lib/auth/use-client-profile";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/hooks/use-require-auth-action", () => ({ useRequireAuthAction: () => async () => undefined }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const profile = (id = ME, nickname = "me"): Profile => ({ id, email: "", nickname, display_name: nickname } as Profile);

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  setSupabaseProfileCache(null);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  setSupabaseProfileCache(null);
});

describe("프로필 캐시 — 바뀌면 알린다", () => {
  it("값이 바뀔 때만 1회 알림 · 같은 값이면 알림 없음 · 해제 뒤 알림 없음", () => {
    const fn = vi.fn();
    const off = subscribeSupabaseProfileCache(fn);
    const p = profile();
    setSupabaseProfileCache(p);
    expect(fn).toHaveBeenCalledTimes(1);
    setSupabaseProfileCache(p);
    expect(fn).toHaveBeenCalledTimes(1);
    patchSupabaseProfileCache({ nickname: "새 이름" });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(getSupabaseProfileCache()?.nickname).toBe("새 이름");
    off();
    setSupabaseProfileCache(null);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("useClientProfile — 캐시가 그린 뒤에 차도 다시 그린다", () => {
  function Probe() {
    const me = useClientProfile();
    return <span>{me?.id ?? "none"}</span>;
  }

  it("빈 캐시로 그린 뒤 캐시가 차면 사용자 값 · 로그아웃(null)도 즉시", () => {
    act(() => root!.render(<Probe />));
    expect(host!.textContent).toBe("none");
    act(() => setSupabaseProfileCache(profile()));
    expect(host!.textContent).toBe(ME);
    act(() => setSupabaseProfileCache(null));
    expect(host!.textContent).toBe("none");
  });

  it("관심이웃 버튼 훅(안내 상자·프로필·관리 공용): 캐시가 늦게 차도 로그인으로 맞춰진다 (예전: 비로그인으로 남음)", async () => {
    const { useNeighborFollowToggle } = await import("@/components/community/ui/NeighborFollowButton");
    function Toggle() {
      const a = useNeighborFollowToggle({ targetUserId: PEER, name: "peer", seed: { following: false, blocked: false } });
      return <span>{a.isSignedIn ? "in" : "out"}</span>;
    }
    act(() => root!.render(<Toggle />));
    expect(host!.textContent).toBe("out");
    act(() => setSupabaseProfileCache(profile()));
    expect(host!.textContent).toBe("in");
  });
});
