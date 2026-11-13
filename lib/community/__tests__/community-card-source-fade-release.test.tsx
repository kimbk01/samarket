// @vitest-environment jsdom
/**
 * FEED 글 카드 빈칸 (2026-11-14 · docs/audit/community-feed-card-blank-after-back-2026-11-14.md)
 * 누른 카드에 붙인 「사라짐」 클래스는 허브 보관(`Activity hidden`)·언마운트 때 떨어져야 한다.
 * 떨어지지 않으면 D1 보관대가 DOM 을 그대로 두므로 돌아왔을 때 그 카드가 투명·안 눌림으로 남는다.
 */
import { Activity, act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/philife",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: ReactNode; prefetch?: boolean }) =>
    createElement("a", { href, ...rest }, children),
}));

import { FeedListLayoutTextOnly, type FeedListCardViewModel } from "@/components/community/feed-list-layouts";
import {
  COMMUNITY_POST_SOURCE_FADE_CLASS,
  clearCommunityPostEntryNavigating,
  releaseCommunityPostSourceFade,
} from "@/lib/community/community-post-entry-nav";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const vm: FeedListCardViewModel = {
  href: "/philife/70a5a9a0-4373-4847-8c19-cb57ec56f4e0",
  topicLabel: "맛집",
  topicColor: null,
  title: "title",
  summary: "summary",
  timeLabel: "",
  authorName: "author",
  secondaryMeta: "",
  likeCount: 0,
  commentCount: 0,
  viewCount: 0,
  isQuestion: false,
  thumbnailUrl: null,
  imageCount: 0,
  placeLine: null,
  hashtagTags: [],
};

let host: HTMLDivElement;
let root: Root;

function render(mode: "visible" | "hidden") {
  act(() => {
    root.render(
      <Activity mode={mode}>
        <FeedListLayoutTextOnly vm={vm} />
      </Activity>
    );
  });
}

function card(): HTMLElement {
  const el = host.querySelector<HTMLElement>('[data-community-card="post"]');
  if (!el) throw new Error("card not rendered");
  return el;
}

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  clearCommunityPostEntryNavigating();
  vi.useRealTimers();
});

describe("글 카드 「사라짐」 클래스 수명", () => {
  it("누르면 붙고 140ms 뒤 상세로 이동한다 (기존 동작 유지)", () => {
    render("visible");
    act(() => {
      card().querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(card().classList.contains(COMMUNITY_POST_SOURCE_FADE_CLASS)).toBe(true);
    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(push).toHaveBeenCalledWith(vm.href, { scroll: false });
  });

  it("허브가 숨겨지면(Activity hidden) 떨어지고, 다시 보일 때 깨끗한 카드다", () => {
    render("visible");
    const el = card();
    act(() => {
      el.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      vi.advanceTimersByTime(140);
    });
    expect(el.classList.contains(COMMUNITY_POST_SOURCE_FADE_CLASS)).toBe(true);

    render("hidden");
    expect(el.classList.contains(COMMUNITY_POST_SOURCE_FADE_CLASS)).toBe(false);

    render("visible");
    /** 같은 DOM 요소가 그대로 다시 보인다(보관) — 그 요소에 클래스가 없어야 한다 */
    expect(card()).toBe(el);
    expect(el.classList.contains(COMMUNITY_POST_SOURCE_FADE_CLASS)).toBe(false);
  });

  it("카드가 없어질 때도 떨어진다", () => {
    render("visible");
    const el = card();
    el.classList.add(COMMUNITY_POST_SOURCE_FADE_CLASS);
    act(() => root.render(null));
    expect(el.classList.contains(COMMUNITY_POST_SOURCE_FADE_CLASS)).toBe(false);
  });

  it("떼기 함수는 null 요소를 무시한다", () => {
    expect(() => releaseCommunityPostSourceFade(null)).not.toThrow();
  });
});
