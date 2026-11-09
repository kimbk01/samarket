/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useReleaseDroppedBlobUrls } from "@/lib/media/use-release-dropped-blob-urls";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** live set 추적 — create 한 것 중 아직 revoke 안 된 URL */
let seq = 0;
const live = new Set<string>();
function create(): string {
  const u = `blob:test/${++seq}`;
  live.add(u);
  return u;
}

function Owner({ urls, borrowed }: { urls: string[]; borrowed?: ReadonlySet<string> }) {
  useReleaseDroppedBlobUrls(urls, borrowed);
  return null;
}

describe("useReleaseDroppedBlobUrls — Blob URL 주인 계약", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers();
    live.clear();
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = (u: string) => void live.delete(u);
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function render(el: React.ReactElement) {
    act(() => root.render(el));
  }
  function unmount() {
    act(() => root.unmount());
    act(() => {
      vi.runAllTimers();
    });
  }

  it("20회 반복(추가 3·교체 1·삭제 1·언마운트) 후 live 0", () => {
    for (let r = 0; r < 20; r += 1) {
      root = createRoot(document.createElement("div"));
      let urls = [create(), create(), create()];
      render(<Owner urls={urls} />);
      urls = [create(), urls[1]!, urls[2]!]; // 교체
      render(<Owner urls={urls} />);
      urls = urls.slice(0, 2); // 삭제
      render(<Owner urls={urls} />);
      unmount();
    }
    expect(live.size).toBe(0);
  });

  it("목록에서 빠진 URL 만 즉시 해제, 남은 URL 은 유지", () => {
    const a = create();
    const b = create();
    render(<Owner urls={[a, b]} />);
    render(<Owner urls={[b]} />);
    expect(live.has(a)).toBe(false);
    expect(live.has(b)).toBe(true);
  });

  it("업로드 후 https 교체 시 blob 해제", () => {
    const a = create();
    render(<Owner urls={[a]} />);
    render(<Owner urls={["https://cdn.example.com/x.jpg"]} />);
    expect(live.size).toBe(0);
  });

  it("빌린 URL(부모 시드)은 삭제·언마운트에도 해제하지 않음 — 재마운트한 폼이 같은 시드를 쓸 수 있음", () => {
    const seed = create();
    const own = create();
    const borrowed = new Set([seed]);
    render(<Owner urls={[seed, own]} borrowed={borrowed} />);
    render(<Owner urls={[own]} borrowed={borrowed} />); // 시드 삭제
    expect(live.has(seed)).toBe(true);
    unmount();
    expect(live.has(seed)).toBe(true);
    expect(live.has(own)).toBe(false);
  });

  it("StrictMode 의 가짜 언마운트로 표시 중 URL 을 해제하지 않음", () => {
    const a = create();
    act(() =>
      root.render(
        <StrictMode>
          <Owner urls={[a]} />
        </StrictMode>
      )
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(live.has(a)).toBe(true);
    unmount();
    expect(live.has(a)).toBe(false);
  });

  /**
   * 업로드 응답 뒤 미리보기 URL 을 만드는 화면(광고 소재 등)의 순서 그대로:
   * 응답 대기 → `isOwnerMounted()` 확인 → 살아 있으면 create 후 목록에 넣고, 사라졌으면 만들지 않는다.
   */
  function UploadOwner({ onReady }: { onReady: (api: { finishUpload: () => void }) => void }) {
    const [urls, setUrls] = React.useState<string[]>([]);
    const isOwnerMounted = useReleaseDroppedBlobUrls(urls);
    React.useEffect(() => {
      onReady({
        finishUpload: () => {
          if (!isOwnerMounted()) return;
          const u = create();
          setUrls((prev) => [...prev, u]);
        },
      });
    }, [isOwnerMounted, onReady]);
    return null;
  }

  it("업로드 중 화면을 닫으면 응답 뒤 미리보기 URL 을 만들지 않는다 — live 0", () => {
    let api: { finishUpload: () => void } | null = null;
    render(<UploadOwner onReady={(a) => (api = a)} />);
    unmount();
    act(() => api!.finishUpload());
    act(() => {
      vi.runAllTimers();
    });
    expect(live.size).toBe(0);
  });

  it("화면이 살아 있으면 응답 뒤 만든 URL 은 목록에 들어가고, 언마운트 때 해제된다", () => {
    let api: { finishUpload: () => void } | null = null;
    render(<UploadOwner onReady={(a) => (api = a)} />);
    act(() => api!.finishUpload());
    expect(live.size).toBe(1);
    unmount();
    expect(live.size).toBe(0);
  });

  it("StrictMode 가짜 언마운트 뒤에도 주인은 살아 있는 것으로 본다", () => {
    let api: { finishUpload: () => void } | null = null;
    act(() =>
      root.render(
        <StrictMode>
          <UploadOwner onReady={(a) => (api = a)} />
        </StrictMode>
      )
    );
    act(() => api!.finishUpload());
    expect(live.size).toBe(1);
    unmount();
    expect(live.size).toBe(0);
  });
});
