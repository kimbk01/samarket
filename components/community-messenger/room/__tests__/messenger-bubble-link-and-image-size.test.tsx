// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessengerLinkifiedText } from "@/components/community-messenger/room/MessengerLinkifiedText";
import { GroupMentionText } from "@/components/community-messenger/group/GroupMentionText";
import { MessengerChatImageBubble } from "@/components/community-messenger/room/MessengerChatImageBubble";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const openDestination = vi.fn(() => true);
const openExternalUrl = vi.fn(async () => true);
vi.mock("@/lib/destination/open-destination", () => ({
  openDestination: (...a: unknown[]) => openDestination(...(a as [])),
  openExternalUrl: (...a: unknown[]) => openExternalUrl(...(a as [])),
}));

const linksIn = (el: Element) => [...el.querySelectorAll('[role="link"]')] as HTMLElement[];

describe("말풍선 본문 링크 · 사진 칸 크기", () => {
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

  it("본문 URL 은 같은 글자 그대로 누를 수 있는 링크로 그린다(<a href> 아님)", () => {
    const s = "📍 Location\nhttps://www.openstreetmap.org/?mlat=1&mlon=2 그리고 www.dibay.app. http://plain.example";
    act(() => root.render(<p>{<MessengerLinkifiedText content={s} />}</p>));
    expect(host.querySelectorAll("a").length).toBe(0);
    expect(linksIn(host).map((a) => [a.textContent, a.tabIndex])).toEqual([
      ["https://www.openstreetmap.org/?mlat=1&mlon=2", 0],
      ["www.dibay.app", 0],
    ]);
    expect(host.textContent).toBe(s);
  });

  it("외부 주소는 앱 안 브라우저(openExternalUrl)로 연다 — 같은 주소 판정은 resolveMessageLinkTarget 테스트", () => {
    openDestination.mockClear();
    openExternalUrl.mockClear();
    act(() => root.render(<p>{<MessengerLinkifiedText content={`www.dibay.app 그리고 https://ext.example/a`} />}</p>));
    const [www, ext] = linksIn(host);
    act(() => www!.click());
    act(() => ext!.click());
    expect(openExternalUrl.mock.calls).toEqual([["https://www.dibay.app/"], ["https://ext.example/a"]]);
    expect(openDestination).not.toHaveBeenCalled();
  });

  it("URL 없는 본문은 링크 없이 글자 그대로", () => {
    act(() => root.render(<p>{<MessengerLinkifiedText content="안녕 @친구" />}</p>));
    expect(linksIn(host).length).toBe(0);
    expect(host.textContent).toBe("안녕 @친구");
  });

  it("그룹방: 멘션 강조는 유지하고 URL 은 링크, 주소 안의 @ 는 멘션으로 보지 않는다", () => {
    const s = "@철수 봐 https://a.com/@user 끝";
    act(() => root.render(<GroupMentionText content={s} isMine={false} />));
    expect(linksIn(host).map((a) => a.textContent)).toEqual(["https://a.com/@user"]);
    const mentions = [...host.querySelectorAll("span.font-semibold")].map((x) => x.textContent);
    expect(mentions).toEqual(["@철수"]);
    expect(host.textContent).toBe(s);
  });

  it("사진 칸은 불러오기 전부터 크기(텔레그램 높이 규칙)가 고정되고 사진은 칸을 채우기만 한다", () => {
    const m = {
      id: "m1",
      roomId: "r1",
      messageType: "image",
      content: "https://x.supabase.co/storage/v1/object/public/post-images/u/r/0.thumb.webp",
      isMine: false,
      imageWidth: 720,
      imageHeight: 960,
    } as unknown as CommunityMessengerMessage;
    act(() => root.render(<MessengerChatImageBubble item={m} onOpenLightbox={vi.fn()} />));
    // jsdom 화면 폭 1024 → 최대 폭 360 · 3:4 사진 높이 480 > 360+100 → 높이 460, 폭 460×0.75 = 345 (자르지 않음)
    const wrap = host.firstElementChild as HTMLElement;
    expect(wrap.hasAttribute("data-cm-photo-bubble")).toBe(true);
    expect(wrap.style.width).toBe("345px");
    expect(wrap.className).not.toMatch(/(^|\s)w-full(\s|$)/);
    const img = host.querySelector("img") as HTMLImageElement;
    expect(img.className).toContain("absolute inset-0");
    expect(img.className).toContain("!h-full");
    const box = img.parentElement as HTMLElement;
    expect(box.style.height).toBe("460px");
  });

  it("흐린 미리보기가 있으면 사진을 받기 전부터 칸에 흐린 층을 그린다 (SSOT M3)", () => {
    const blur = "data:image/webp;base64,UklGRhQAAABXRUJQVlA4IAgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=";
    const m = {
      id: "m2",
      roomId: "r1",
      messageType: "image",
      content: "https://x.supabase.co/storage/v1/object/public/post-images/u/r/1.thumb.webp",
      isMine: false,
      imageWidth: 1600,
      imageHeight: 1200,
      imageBlurDataUrl: blur,
    } as unknown as CommunityMessengerMessage;
    act(() => root.render(<MessengerChatImageBubble item={m} onOpenLightbox={vi.fn()} />));
    const layer = host.querySelector("[data-cm-photo-blur]") as HTMLElement | null;
    expect(layer).not.toBeNull();
    expect(layer!.style.backgroundImage).toContain("data:image/webp;base64,");
  });
});

describe("사진 교체 끊김 없음 (SSOT M3 · 2026-11-16 Samsung 녹화 흐림 1프레임 정정)", () => {
  let host2: HTMLDivElement;
  let root2: Root;
  beforeEach(() => {
    host2 = document.createElement("div");
    document.body.appendChild(host2);
    root2 = createRoot(host2);
  });
  afterEach(() => {
    act(() => root2.unmount());
    host2.remove();
  });

  it("주소가 바뀌면 이미 그려진 직전 img 요소(같은 DOM)를 그대로 두고, 새 사진 디코딩 후 뺀다", async () => {
    let resolveDecode: () => void = () => {};
    const proto = HTMLImageElement.prototype as unknown as { decode?: () => Promise<void> };
    const prevDecode = proto.decode;
    proto.decode = () => new Promise<void>((r) => (resolveDecode = r));
    try {
      const base = {
        id: "m3",
        roomId: "r1",
        messageType: "image",
        isMine: true,
        imageWidth: 1600,
        imageHeight: 1200,
      };
      const local = { ...base, content: "blob:local-1", pending: true } as unknown as CommunityMessengerMessage;
      act(() => root2.render(<MessengerChatImageBubble item={local} onOpenLightbox={vi.fn()} />));
      const first = host2.querySelector('img[src="blob:local-1"]') as HTMLImageElement;
      act(() => {
        first.dispatchEvent(new Event("load"));
      });
      await act(async () => {
        resolveDecode();
        await Promise.resolve();
      });
      const server = {
        ...base,
        content: "https://x.supabase.co/storage/v1/object/public/post-images/u/r/9.thumb.webp",
      } as unknown as CommunityMessengerMessage;
      act(() => root2.render(<MessengerChatImageBubble item={server} onOpenLightbox={vi.fn()} />));
      // 직전 요소가 같은 DOM 노드로 남아 있다(새로 만들면 디코딩 전이라 한 프레임 비었다)
      expect(host2.querySelector('img[src="blob:local-1"]')).toBe(first);
      const next = [...host2.querySelectorAll("img")].find((el) => el !== first)!;
      act(() => {
        next.dispatchEvent(new Event("load"));
      });
      expect(host2.querySelector('img[src="blob:local-1"]')).toBe(first); // 디코딩 전에는 유지
      await act(async () => {
        resolveDecode();
        await Promise.resolve();
      });
      expect(host2.querySelector('img[src="blob:local-1"]')).toBeNull();
      expect(host2.querySelectorAll("img")).toHaveLength(1);
    } finally {
      if (prevDecode) proto.decode = prevDecode;
      else delete proto.decode;
    }
  });
});
