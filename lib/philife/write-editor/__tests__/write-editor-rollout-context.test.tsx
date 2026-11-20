// @vitest-environment jsdom
/**
 * 감사 docs/audit/lounge-paste-images-2026-11-20.md §11 R2 — 서버가 넘긴 편집기 판정이 있으면 요청 없이 바로 확정.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityWriteEditorRollout } from "@/lib/philife/write-editor/write-editor-flag";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Mode = { resolved: boolean; useWysiwyg: boolean; canOptIn: boolean };

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, rollout: "admin", canOptIn: false }), { status: 200 }));

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

async function renderMode(rollout: CommunityWriteEditorRollout | null): Promise<Mode[]> {
  /** 훅과 Provider 를 같은 모듈 사본에서 — `resetModules` 뒤 서로 다른 context 가 되지 않게 */
  const { useCommunityWriteEditorMode } = await import("@/lib/philife/write-editor/use-community-write-editor-mode");
  const { CommunityWriteEditorRolloutProvider } = await import("@/lib/philife/write-editor/write-editor-rollout-context");
  const seen: Mode[] = [];
  function Probe() {
    const m = useCommunityWriteEditorMode();
    seen.push({ resolved: m.resolved, useWysiwyg: m.useWysiwyg, canOptIn: m.canOptIn });
    return null;
  }
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      rollout ? (
        <CommunityWriteEditorRolloutProvider rollout={rollout}>
          <Probe />
        </CommunityWriteEditorRolloutProvider>
      ) : (
        <Probe />
      )
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return seen;
}

describe("편집기 판정 — 서버 값 우선 (§11 R2)", () => {
  it("on: 첫 렌더부터 새 편집기 확정, 판정 요청 없음", async () => {
    const seen = await renderMode("on");
    expect(seen[0]).toEqual({ resolved: true, useWysiwyg: true, canOptIn: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("off: 첫 렌더부터 예전 입력칸 확정, 판정 요청 없음", async () => {
    const seen = await renderMode("off");
    expect(seen[0]).toEqual({ resolved: true, useWysiwyg: false, canOptIn: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("admin 또는 값 없음: 관리자 여부를 요청하고 그 전에는 미확정", async () => {
    const seen = await renderMode("admin");
    expect(seen[0]?.resolved).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const seen2 = await (async () => {
      act(() => root?.unmount());
      host?.remove();
      return renderMode(null);
    })();
    expect(seen2[0]?.resolved).toBe(false);
  });
});
