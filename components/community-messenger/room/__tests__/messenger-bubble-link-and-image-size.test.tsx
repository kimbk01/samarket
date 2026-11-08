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

  it("본문 URL 은 같은 글자 그대로 누를 수 있는 링크로 그린다", () => {
    const s = "📍 Location\nhttps://www.openstreetmap.org/?mlat=1&mlon=2 그리고 www.dibay.app.";
    act(() => root.render(<p>{<MessengerLinkifiedText content={s} />}</p>));
    const anchors = [...host.querySelectorAll("a")];
    expect(anchors.map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")])).toEqual([
      ["https://www.openstreetmap.org/?mlat=1&mlon=2", "https://www.openstreetmap.org/?mlat=1&mlon=2", "_blank", "noopener noreferrer"],
      ["www.dibay.app", "https://www.dibay.app", "_blank", "noopener noreferrer"],
    ]);
    expect(host.textContent).toBe(s);
  });

  it("URL 없는 본문은 링크 없이 글자 그대로", () => {
    act(() => root.render(<p>{<MessengerLinkifiedText content="안녕 @친구" />}</p>));
    expect(host.querySelectorAll("a").length).toBe(0);
    expect(host.textContent).toBe("안녕 @친구");
  });

  it("그룹방: 멘션 강조는 유지하고 URL 은 링크, 주소 안의 @ 는 멘션으로 보지 않는다", () => {
    const s = "@철수 봐 https://a.com/@user 끝";
    act(() => root.render(<GroupMentionText content={s} isMine={false} />));
    const anchors = [...host.querySelectorAll("a")];
    expect(anchors.map((a) => a.textContent)).toEqual(["https://a.com/@user"]);
    const mentions = [...host.querySelectorAll("span.font-semibold")].map((x) => x.textContent);
    expect(mentions).toEqual(["@철수"]);
    expect(host.textContent).toBe(s);
  });

  it("사진 칸은 불러오기 전부터 너비가 고정되고 사진은 칸을 채우기만 한다", () => {
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
    const wrap = host.firstElementChild as HTMLElement;
    expect(wrap.className).toContain("w-[min(62vw,280px)]");
    expect(wrap.className).not.toMatch(/(^|\s)w-full(\s|$)/);
    const img = host.querySelector("img") as HTMLImageElement;
    expect(img.className).toContain("absolute inset-0");
    const box = img.parentElement as HTMLElement;
    expect(box.style.aspectRatio).toBe("0.75");
  });
});
