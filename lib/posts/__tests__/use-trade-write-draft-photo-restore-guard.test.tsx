/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  settleTradeWriteDraftPhotoRestore,
  useTradeWriteDraftPhotoRestoreGuard,
} from "@/lib/posts/use-trade-write-draft-photo-restore-guard";
import { useReleaseDroppedBlobUrls } from "@/lib/media/use-release-dropped-blob-urls";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let seq = 0;
const live = new Set<string>();
function create(): string {
  const u = `blob:draft/${++seq}`;
  live.add(u);
  return u;
}

type Item = { url: string };
type Deferred = { resolve: (items: Item[]) => void };

/**
 * 거래 글쓰기 폼의 초안 사진 복원 흐름 그대로:
 * images 주인 훅 + 복원 시작(begin) → 비동기 결과 → settle(적용 또는 폐기·해제), 초기화(invalidate).
 */
function WriteForm({ onReady }: { onReady: (api: { restore: () => Deferred; reset: () => void }) => void }) {
  const [images, setImages] = useState<Item[]>([]);
  useReleaseDroppedBlobUrls(images.map((i) => i.url));
  const guard = useTradeWriteDraftPhotoRestoreGuard();
  React.useEffect(() => {
    onReady({
      restore: () => {
        const isCurrent = guard.begin();
        let resolve: (items: Item[]) => void = () => {};
        void new Promise<Item[]>((r) => {
          resolve = r;
        }).then((items) => {
          settleTradeWriteDraftPhotoRestore(isCurrent, items, (restored) => setImages(restored));
        });
        return { resolve };
      },
      reset: () => {
        guard.invalidate();
        setImages([]);
      },
    });
  }, [guard, onReady]);
  return <div data-count={images.length} />;
}

describe("거래 글쓰기 초안 사진 복원 가드 — 버려지는 결과의 blob URL 해제", () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: { restore: () => Deferred; reset: () => void } | null;
  beforeEach(() => {
    vi.useFakeTimers();
    live.clear();
    api = null;
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = (u: string) => void live.delete(u);
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const count = () => Number(host.firstElementChild?.getAttribute("data-count") ?? "-1");
  const settle = async (d: Deferred, items: Item[]) => {
    await act(async () => {
      d.resolve(items);
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const unmount = () => {
    act(() => root.unmount());
    act(() => {
      vi.runAllTimers();
    });
  };

  it("복원 중 화면을 닫으면 결과를 적용하지 않고 그 결과로 만든 URL 을 해제 — live 0", async () => {
    act(() => root.render(<WriteForm onReady={(a) => (api = a)} />));
    const d = api!.restore();
    unmount();
    await settle(d, [{ url: create() }, { url: create() }, { url: "https://cdn.example.com/a.jpg" }]);
    expect(live.size).toBe(0);
  });

  it("화면이 살아 있으면 복원 결과가 목록에 들어가고, 이후 언마운트 때 주인 훅이 해제", async () => {
    act(() => root.render(<WriteForm onReady={(a) => (api = a)} />));
    const d = api!.restore();
    await settle(d, [{ url: create() }, { url: create() }]);
    expect(count()).toBe(2);
    expect(live.size).toBe(2);
    unmount();
    expect(live.size).toBe(0);
  });

  it("복원 중 새 복원이 시작되면 이전 결과는 버리고 해제, 새 결과만 적용", async () => {
    act(() => root.render(<WriteForm onReady={(a) => (api = a)} />));
    const first = api!.restore();
    const second = api!.restore();
    const old = create();
    await settle(first, [{ url: old }]);
    expect(live.has(old)).toBe(false);
    expect(count()).toBe(0);
    await settle(second, [{ url: create() }]);
    expect(count()).toBe(1);
    expect(live.size).toBe(1);
  });

  it("복원 중 초기화(새로 작성)하면 결과를 버리고 해제", async () => {
    act(() => root.render(<WriteForm onReady={(a) => (api = a)} />));
    const d = api!.restore();
    act(() => api!.reset());
    await settle(d, [{ url: create() }]);
    expect(count()).toBe(0);
    expect(live.size).toBe(0);
  });

  it("StrictMode 가짜 언마운트·재마운트는 진행 중 복원을 취소하지 않는다", async () => {
    act(() =>
      root.render(
        <StrictMode>
          <WriteForm onReady={(a) => (api = a)} />
        </StrictMode>
      )
    );
    const d = api!.restore();
    await settle(d, [{ url: create() }]);
    expect(count()).toBe(1);
    expect(live.size).toBe(1);
  });
});
