// @vitest-environment jsdom
/**
 * 관심이웃 전체 수정 설계 v2 §7 — PR-C 모임: 내 id 를 마운트 때 한 번 읽던 결함 (실패 재현)
 * 예전: `useEffect(() => setMyId(getHydrationSafeCurrentUser()?.id), [])` — 캐시가 늦게 차면 「나」 판정·신고 사유 읽기가 영영 안 맞음
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ME = "11111111-1111-4111-8111-111111111111";
const detailCalls: string[] = [];

vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k, language: "ko" }) }));
vi.mock("@/components/ui/dibay-overlay", () => ({
  DibaySheetHeader: () => null,
  DibayUsableAreaSheet: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/moim/moim-client-api", () => ({
  moimApi: {
    detail: async (id: string) => {
      detailCalls.push(id);
      return { ok: true, moim: { reportReasons: null } };
    },
  },
  moimErrorKey: () => "x",
}));
vi.mock("@/lib/auth/dibay-session-manager", () => ({
  ensureSessionHealthy: async () => ({ ok: false, phase: "loading" }),
  subscribeDibayAuthStateChange: () => () => undefined,
  getSessionPhase: () => "loading",
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  detailCalls.length = 0;
  (await import("@/lib/auth/supabase-profile-cache")).setSupabaseProfileCache(null);
  (await import("@/hooks/use-client-membership-state")).resetClientMembershipStateForTests();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  (await import("@/lib/auth/supabase-profile-cache")).setSupabaseProfileCache(null);
});

describe("모임 신고 시트 — 회원이 늦게 확인돼도 신고 사유를 읽는다", () => {
  it("캐시가 빈 채 열면 읽지 않고, 회원이 되면 그때 1번 읽는다 (예전: 마운트 때 한 번 판정해 영영 안 읽음)", async () => {
    const { MoimReportSheet } = await import("@/components/moim/MoimReportSheet");
    await act(async () =>
      root.render(<MoimReportSheet moimId="m1" target={{ type: "moim", id: "m1" }} onClose={() => undefined} onDone={() => undefined} />),
    );
    expect(detailCalls).toEqual([]);
    const { setSupabaseProfileCache } = await import("@/lib/auth/supabase-profile-cache");
    await act(async () => setSupabaseProfileCache({ id: ME, email: "", nickname: "me" } as never));
    expect(detailCalls).toEqual(["m1"]);
  });
});
