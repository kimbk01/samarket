// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessengerChatImageBubble } from "@/components/community-messenger/room/MessengerChatImageBubble";
import { extractMessengerAlbumIndexFromTarget } from "@/lib/community-messenger/attachment/messenger-photo-save-menu";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

const P = "https://x.supabase.co/storage/v1/object/public/post-images/u/r";
const album = [0, 1, 2, 3, 4, 5].map((i) => `${P}/${i}.thumb.webp`);
const originals = [0, 1, 2, 3, 4, 5].map((i) => `${P}/${i}.jpg`);

function msg(over: Partial<CommunityMessengerMessage>): CommunityMessengerMessage {
  return {
    id: "m1",
    messageType: "image",
    content: album[0]!,
    isMine: false,
    ...over,
  } as CommunityMessengerMessage;
}

describe("MessengerChatImageBubble — album cells (D2/D3)", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("5+ album: cells carry data-album-index 0..2, +N tile is data-album-rest and opens index 3", () => {
    const onOpen = vi.fn();
    act(() => {
      root.render(
        <MessengerChatImageBubble
          item={msg({ imageAlbumUrls: album, imageAlbumOriginalUrls: originals })}
          onOpenLightbox={onOpen}
        />
      );
    });
    const cells = Array.from(host.querySelectorAll("[data-album-index]")).map((el) =>
      el.getAttribute("data-album-index")
    );
    expect(cells).toEqual(["0", "1", "2"]);
    const rest = host.querySelector("[data-album-rest]") as HTMLButtonElement;
    expect(rest).not.toBeNull();
    expect(rest.hasAttribute("data-album-index")).toBe(false);
    expect(rest.querySelector("img")!.getAttribute("src")).toBe(album[3]);
    act(() => rest.click());
    expect(onOpen).toHaveBeenCalledWith(album, originals, 3);

    // long-press start on the <img> inside a cell resolves that cell's index; +N tile → none
    const img2 = host.querySelectorAll("[data-album-index]")[2]!.querySelector("img")!;
    expect(extractMessengerAlbumIndexFromTarget(img2)).toBe(2);
    expect(extractMessengerAlbumIndexFromTarget(rest.querySelector("img"))).toBeUndefined();
    expect(extractMessengerAlbumIndexFromTarget(host.firstElementChild)).toBeUndefined();
  });

  it("single image cell → index 0", () => {
    act(() => {
      root.render(<MessengerChatImageBubble item={msg({ content: originals[0]! })} onOpenLightbox={vi.fn()} />);
    });
    const img = host.querySelector("img")!;
    expect(extractMessengerAlbumIndexFromTarget(img)).toBe(0);
  });
});
