// @vitest-environment jsdom
/**
 * 사진 확대 SSOT (M1, `docs/design/messenger-media-emoji-ssot-design-2026-11-15.md`) —
 * 앱의 사진 전체 화면 보기는 공용 뷰어 `DibayImageViewer` 하나만 쓴다.
 * 2026-11-15 실기: 메신저만 별도 뷰어(확대·밀어 닫기 없음, 뒤로 키에 방까지 나감)를 써서 갈라졌던 것을 고정한다.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));
vi.mock("@/lib/community-messenger/attachment/messenger-image-save", async (orig) => {
  const mod = (await orig()) as Record<string, unknown>;
  return { ...mod, resolveMessengerImageSaveMode: () => Promise.resolve("none") };
});

import { DibayImageViewer } from "@/components/common/media/DibayImageViewer";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("사진 확대 진입점 — 공용 뷰어 하나", () => {
  const entryPoints = [
    "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx",
    "components/community/post-detail/CommunityPostDetailBody.tsx",
    "components/community/NeighborhoodInterleavedContent.tsx",
    "components/community/post-detail/ImportedRichContent.tsx",
    "components/product/detail/ProductImageGallery.tsx",
    "components/stores/StoreDetailPublic.tsx",
    /** R5 B8·B9: 모임 앨범·글·일정 사진 */
    "components/moim/MoimAlbum.tsx",
    "components/moim/MoimPostDetailScreen.tsx",
    "components/moim/MoimScheduleDetailScreen.tsx",
  ];
  it.each(entryPoints)("%s 는 DibayImageViewer 를 쓴다", (f) => {
    expect(read(f)).toContain("@/components/common/media/DibayImageViewer");
  });

  it("옛 메신저 전용 뷰어·옛 게시글 뷰어 파일이 없다", () => {
    expect(existsSync(join(process.cwd(), "components/community-messenger/room/MessengerImageLightbox.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "components/common/media/PostImageViewer.tsx"))).toBe(false);
  });

  it("구조 확인: 모임 앨범 전용 뷰어(MoimAlbumViewer)가 없다 (R5 B8)", () => {
    expect(read("components/moim/MoimAlbum.tsx")).not.toContain("MoimAlbumViewer");
  });

  it("메신저 말풍선은 말풍선 썸네일을 placeholder 로 넘긴다", () => {
    const src = read("components/community-messenger/room/MessengerChatImageBubble.tsx");
    expect(src).toMatch(/placeholder: thumb/);
  });
});

describe("DibayImageViewer 계약", () => {
  const src = read("components/common/media/DibayImageViewer.tsx");

  it("body 포털 · 화면 단위(vh) 크기 없음 · 제스처 영역 touch-none", () => {
    expect(src).toMatch(/createPortal\(node, document\.body\)/);
    expect(src).not.toMatch(/(?:100|88)(?:dvh|vh)/);
    expect(src).toMatch(/touch-none/);
  });

  it("뒤로 = 히스토리 1칸(같은 주소·Next 상태 유지) — Capacitor backButton 리스너 없음", () => {
    expect(src).toContain("...window.history.state");
    expect(src).not.toContain('addListener("backButton"');
  });

  describe("렌더", () => {
    let host: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
      (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      if (typeof globalThis.ResizeObserver === "undefined") {
        (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
          observe() {}
          disconnect() {}
        };
      }
      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);
    });
    afterEach(() => {
      act(() => root.unmount());
      host.remove();
    });

    it("받는 동안 placeholder 를 먼저 그리고, 화면용이 로드되면 걷는다", () => {
      act(() => {
        root.render(
          <DibayImageViewer
            open
            items={[{ display: "https://x.test/p.webp", original: "https://x.test/o.jpg", placeholder: "https://x.test/t.webp" }]}
            index={0}
            onClose={() => {}}
          />
        );
      });
      const ph = document.querySelector('[data-testid="image-viewer-placeholder"]') as HTMLImageElement | null;
      expect(ph?.getAttribute("src")).toBe("https://x.test/t.webp");
      expect(document.querySelector('[data-testid="image-viewer-loading"]')).toBeNull();
      const cur = document.querySelector('[data-testid="image-viewer-current"]') as HTMLImageElement;
      expect(cur.getAttribute("src")).toBe("https://x.test/p.webp");
      act(() => {
        cur.dispatchEvent(new Event("load"));
      });
      expect(document.querySelector('[data-testid="image-viewer-placeholder"]')).toBeNull();
    });

    it("load 뒤 디코딩이 끝날 때까지 placeholder 를 유지한다 (검은 프레임 0)", async () => {
      let resolveDecode: () => void = () => {};
      const proto = HTMLImageElement.prototype as unknown as { decode?: () => Promise<void> };
      const prevDecode = proto.decode;
      proto.decode = () => new Promise<void>((r) => (resolveDecode = r));
      try {
        act(() => {
          root.render(
            <DibayImageViewer
              open
              items={[{ display: "https://x.test/p.webp", original: "https://x.test/o.jpg", placeholder: "https://x.test/t.webp" }]}
              index={0}
              onClose={() => {}}
            />
          );
        });
        const cur = document.querySelector('[data-testid="image-viewer-current"]') as HTMLImageElement;
        act(() => {
          cur.dispatchEvent(new Event("load"));
        });
        expect(document.querySelector('[data-testid="image-viewer-placeholder"]')).not.toBeNull();
        await act(async () => {
          resolveDecode();
          await Promise.resolve();
        });
        expect(document.querySelector('[data-testid="image-viewer-placeholder"]')).toBeNull();
      } finally {
        if (prevDecode) proto.decode = prevDecode;
        else delete proto.decode;
      }
    });

    it("onMore 를 주면 「⋯」 버튼이 생기고, 누르면 지금 칸 번호를 넘긴다 (R5 B8·B9)", () => {
      const onMore = vi.fn();
      const items = [
        { display: "https://x.test/a.webp", original: "https://x.test/a.webp" },
        { display: "https://x.test/b.webp", original: "https://x.test/b.webp" },
      ];
      act(() => {
        root.render(<DibayImageViewer open items={items} index={1} onClose={() => {}} onMore={onMore} moreLabel="more" />);
      });
      const btn = document.querySelector('[data-testid="image-viewer-more"]') as HTMLButtonElement | null;
      expect(btn?.getAttribute("aria-label")).toBe("more");
      act(() => btn?.click());
      expect(onMore).toHaveBeenCalledWith(1);
    });

    it("onMore 가 없으면 「⋯」 버튼이 없다 (다른 진입점 그대로)", () => {
      act(() => {
        root.render(<DibayImageViewer open items={[{ display: "https://x.test/a.webp", original: "https://x.test/a.webp" }]} index={0} onClose={() => {}} />);
      });
      expect(document.querySelector('[data-testid="image-viewer-more"]')).toBeNull();
    });

    it("placeholder 가 없으면 로딩 표시", () => {
      act(() => {
        root.render(
          <DibayImageViewer open items={[{ display: "https://x.test/p.webp", original: "https://x.test/p.webp" }]} index={0} onClose={() => {}} />
        );
      });
      expect(document.querySelector('[data-testid="image-viewer-placeholder"]')).toBeNull();
      expect(document.querySelector('[data-testid="image-viewer-loading"]')).not.toBeNull();
    });
  });
});
