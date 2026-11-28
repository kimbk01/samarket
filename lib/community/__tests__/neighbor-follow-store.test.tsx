// @vitest-environment jsdom
/**
 * 관심이웃 화면 상태 저장소 — 감사 E1(한 화면 두 버튼이 서로 다른 값을 보던 결함) 재현.
 * 글 상세 안내·⋯ 메뉴·프로필·내정보 관리 = 같은 대상이면 같은 값.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetNeighborFollowStoreForTests,
  applyBlockToNeighborRelation,
  ensureNeighborStoreViewer,
  readNeighborRelation,
  seedNeighborRelation,
  setNeighborFollow,
  useNeighborRelation,
} from "@/lib/community/neighbor-follow-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PEER = "22222222-2222-4222-8222-222222222222";

function Probe({ id, label }: { id: string; label: string }) {
  const s = useNeighborRelation(PEER, { seed: { following: false, blocked: false } });
  return (
    <span data-testid={id}>
      {label}:{String(s.following)}
    </span>
  );
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  __resetNeighborFollowStoreForTests();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

describe("neighbor-follow-store", () => {
  it("안내 버튼에서 추가 → 같은 화면의 ⋯ 메뉴도 즉시 「관심이웃」(예전: 메뉴는 추가로 남아 누르면 해제)", async () => {
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { following: boolean };
      return new Response(JSON.stringify({ ok: true, following: body.following }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    act(() => {
      root!.render(
        <>
          <Probe id="prompt" label="prompt" />
          <Probe id="menu" label="menu" />
        </>,
      );
    });
    expect(host!.textContent).toBe("prompt:falsemenu:false");
    await act(async () => {
      await setNeighborFollow(PEER, true);
    });
    expect(host!.textContent).toBe("prompt:truemenu:true");
    /** 서버로 간 요청은 상태 지정 — 같은 「추가」를 다시 보내도 해제가 아니다 */
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ targetUserId: PEER, following: true });
  });

  it("실패하면 화면 값을 되돌리고 코드 반환 (상한·차단)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "neighbor_follow_limit" }), { status: 409 })),
    );
    seedNeighborRelation(PEER, { following: false, blocked: false });
    const r = await setNeighborFollow(PEER, true);
    expect(r).toEqual({ ok: false, error: "neighbor_follow_limit", status: 409 });
    expect(readNeighborRelation(PEER).following).toBe(false);
    expect(readNeighborRelation(PEER).busy).toBe(false);
  });

  it("캐시된 상세의 낡은 시작 값은 방금 바꾼 값을 덮지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, following: true }), { status: 200 })),
    );
    seedNeighborRelation(PEER, { following: false });
    await setNeighborFollow(PEER, true);
    seedNeighborRelation(PEER, { following: false });
    expect(readNeighborRelation(PEER).following).toBe(true);
  });

  it("차단하면 관심이웃도 꺼진다(서버 blockUserSocial 과 같음)", () => {
    seedNeighborRelation(PEER, { following: true, blocked: false });
    applyBlockToNeighborRelation(PEER, true);
    expect(readNeighborRelation(PEER)).toMatchObject({ following: false, blocked: true });
  });

  it("재감사 2 — 처음 읽기가 늦게 끝나도 그 사이 사용자가 추가한 값을 덮지 않는다", async () => {
    let releaseGet: (v: Response) => void = () => {};
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, following: true }), { status: 200 }));
      }
      if (url.includes("neighbor-relations")) return new Promise<Response>((r) => (releaseGet = r));
      return Promise.resolve(new Response(JSON.stringify({ ok: true, blocked: false }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    function Loader() {
      useNeighborRelation(PEER);
      return null;
    }
    act(() => root!.render(<Loader />));
    await act(async () => {
      await setNeighborFollow(PEER, true);
    });
    expect(readNeighborRelation(PEER).following).toBe(true);
    await act(async () => {
      releaseGet(new Response(JSON.stringify({ ok: true, following: false }), { status: 200 }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(readNeighborRelation(PEER).following).toBe(true);
  });

  it("재감사 8 — 로그인 회원이 바뀌면 이전 회원 값을 비운다", () => {
    ensureNeighborStoreViewer("viewer-a");
    seedNeighborRelation(PEER, { following: true, blocked: false });
    ensureNeighborStoreViewer("viewer-b");
    expect(readNeighborRelation(PEER).following).toBeNull();
  });

  it("요청 중 재탭은 보내지 않는다", async () => {
    let release: (v: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (release = r)));
    vi.stubGlobal("fetch", fetchMock);
    const first = setNeighborFollow(PEER, true);
    const second = await setNeighborFollow(PEER, false);
    expect(second).toEqual({ ok: false, error: "busy", status: 409 });
    release(new Response(JSON.stringify({ ok: true, following: true }), { status: 200 }));
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readNeighborRelation(PEER).following).toBe(true);
  });
});
