// @vitest-environment jsdom
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/mypage/offers",
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock("@/lib/ui/use-form-keyboard-viewport", () => ({
  useFormKeyboardViewport: () => ({ effectiveBottomInset: 0, keyboardOpen: false }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...(rest as Record<string, never>)}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/my/MySubpageHeader", () => ({
  MySubpageHeader: ({ title }: { title?: ReactNode }) => <header data-testid="header">{title}</header>,
}));

import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { MyListPager } from "@/components/mypage/ds/MyListPager";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import { MyToggle } from "@/components/mypage/ds/MyToggle";
import { MyRow } from "@/components/mypage/ds/MyRow";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { BottomNavScrollChromeProvider } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { MypageToastHost } from "@/components/mypage/MypageToastHost";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { useMypageTabParam } from "@/lib/mypage/use-mypage-tab-param";
import {
  MYPAGE_TOAST_ACTION_MS,
  MYPAGE_TOAST_EVENT,
  MYPAGE_TOAST_MOTION_MS,
  showMypageToast,
  showMypageUndoToast,
} from "@/lib/mypage/mypage-toast";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(node: ReactNode) {
  act(() => root!.render(node));
}

function q(testId: string): HTMLElement | null {
  return host!.querySelector(`[data-testid="${testId}"]`);
}

function click(el: Element | null) {
  expect(el).not.toBeNull();
  act(() => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  search = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

describe("MyStateView", () => {
  it("renders n skeleton rows for list (T1) — default 5, custom rows", () => {
    mount(<MyStateView kind="loading" template="list" />);
    expect(q("my-state-loading")?.getAttribute("aria-busy")).toBe("true");
    expect(host!.querySelectorAll("[data-skeleton-row]")).toHaveLength(5);

    mount(<MyStateView kind="loading" template="list" rows={3} listVariant="thumb" />);
    expect(host!.querySelectorAll("[data-skeleton-row]")).toHaveLength(3);
  });

  it("detail (T2) = summary + 2 sections × 3 rows; form (T3) = n inputs; asset = balance + rows", () => {
    mount(<MyStateView kind="loading" template="detail" />);
    expect(host!.querySelectorAll("[data-skeleton-summary]")).toHaveLength(1);
    expect(host!.querySelectorAll("[data-skeleton-section]")).toHaveLength(2);
    expect(host!.querySelectorAll("[data-skeleton-row]")).toHaveLength(6);

    mount(<MyStateView kind="loading" template="form" rows={4} />);
    expect(host!.querySelectorAll("[data-skeleton-row]")).toHaveLength(4);

    mount(<MyStateView kind="loading" template="asset" />);
    expect(host!.querySelectorAll("[data-skeleton-summary]")).toHaveLength(1);
    expect(host!.querySelectorAll("[data-skeleton-row]")).toHaveLength(5);
  });

  it("settings (T4) draws real row titles with toggle placeholders; static draws nothing", () => {
    mount(<MyStateView kind="loading" template="settings" rowLabels={["알림", "소리"]} />);
    expect(host!.querySelectorAll("[data-skeleton-row]")).toHaveLength(2);
    expect(host!.textContent).toContain("알림");
    expect(host!.textContent).toContain("소리");

    mount(<MyStateView kind="loading" template="static" />);
    expect(q("my-state-loading")).toBeNull();
  });

  it("empty shows title, body and cta", () => {
    mount(
      <MyStateView
        kind="empty"
        empty={{ title: "찜한 상품이 없어요", body: "마음에 드는 상품을 찜해 보세요", cta: <button type="button" data-testid="empty-cta">둘러보기</button> }}
      />
    );
    const el = q("my-state-empty");
    expect(el?.textContent).toContain("찜한 상품이 없어요");
    expect(el?.textContent).toContain("마음에 드는 상품을 찜해 보세요");
    expect(el?.querySelector("[data-testid='empty-cta']")).not.toBeNull();
    expect(q("my-state-error")).toBeNull();
  });

  it("error shows message and invokes onRetry", () => {
    const onRetry = vi.fn();
    mount(<MyStateView kind="error" error={{ message: "불러오지 못했어요", onRetry }} />);
    expect(q("my-state-error")?.getAttribute("role")).toBe("alert");
    expect(q("my-state-error")?.textContent).toContain("불러오지 못했어요");
    click(q("my-state-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("error without message uses the common copy (never empty)", () => {
    mount(<MyStateView kind="error" error={{ onRetry: () => undefined }} />);
    expect(q("my-state-error")?.querySelector("p")?.textContent?.trim().length).toBeGreaterThan(0);
  });
});

describe("MyListPager", () => {
  it("renders nothing when there is no more page and no error", () => {
    mount(<MyListPager hasMore={false} loading={false} onLoadMore={() => undefined} />);
    expect(host!.innerHTML).toBe("");
  });

  it("load more button calls onLoadMore once while in flight (single flight)", async () => {
    let resolve: () => void = () => undefined;
    const onLoadMore = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    mount(<MyListPager hasMore loading={false} onLoadMore={onLoadMore} />);
    click(q("my-list-pager-more"));
    click(q("my-list-pager-more"));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    resolve();
    await flush();
    click(q("my-list-pager-more"));
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("failure shows retry which calls onLoadMore again", () => {
    const onLoadMore = vi.fn();
    mount(<MyListPager hasMore loading={false} error onLoadMore={onLoadMore} />);
    expect(q("my-list-pager-more")).toBeNull();
    expect(q("my-list-pager-error")?.getAttribute("role")).toBe("alert");
    click(q("my-list-pager-retry"));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("button is disabled while loading", () => {
    mount(<MyListPager hasMore loading onLoadMore={() => undefined} />);
    expect((q("my-list-pager-more") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("MyStickyCta", () => {
  it("primary is disabled until dirty, then calls onPress", () => {
    const onPress = vi.fn();
    mount(<MyStickyCta dirty={false} primary={{ label: "저장", onPress }} />);
    const btn = q("my-sticky-cta-primary") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    click(btn);
    expect(onPress).not.toHaveBeenCalled();

    mount(<MyStickyCta dirty primary={{ label: "저장", onPress }} />);
    expect((q("my-sticky-cta-primary") as HTMLButtonElement).disabled).toBe(false);
    click(q("my-sticky-cta-primary"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("loading disables primary and shows spinner; secondary stays usable", () => {
    const onCancel = vi.fn();
    mount(
      <MyStickyCta
        dirty
        primary={{ label: "저장", onPress: () => undefined, loading: true }}
        secondary={{ label: "취소", onPress: onCancel }}
      />
    );
    const btn = q("my-sticky-cta-primary") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    click(q("my-sticky-cta-secondary"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disabled primary uses token grey (no opacity) and bar has no tab clearance outside provider", () => {
    mount(<MyStickyCta dirty={false} primary={{ label: "저장", onPress: () => undefined }} />);
    const btn = q("my-sticky-cta-primary") as HTMLButtonElement;
    expect(btn.className).toContain("disabled:bg-[color:var(--sam-primary-disabled)]");
    expect(btn.className).not.toContain("disabled:opacity-45");
    expect(q("my-sticky-cta")!.getAttribute("data-above-bottom-nav")).toBe("0");
    expect(q("my-sticky-cta")!.style.bottom).toBe("0px");
  });

  it("publishes toast offset var while mounted", () => {
    mount(<MyStickyCta dirty primary={{ label: "저장", onPress: () => undefined }} />);
    expect(document.documentElement.style.getPropertyValue("--mypage-toast-bottom")).toMatch(/px$/);
    act(() => root!.render(<div />));
    expect(document.documentElement.style.getPropertyValue("--mypage-toast-bottom")).toBe("");
  });
});

describe("useMypageSubmitGuard", () => {
  it("blocks double submit while the first run is in flight", async () => {
    let api: ReturnType<typeof useMypageSubmitGuard> | null = null;
    function Probe() {
      const g = useMypageSubmitGuard();
      useEffect(() => {
        api = g;
      });
      return <span data-testid="pending">{g.pending ? "1" : "0"}</span>;
    }
    mount(<Probe />);
    let resolve: (v: string) => void = () => undefined;
    const task = vi.fn(() => new Promise<string>((r) => (resolve = r)));

    let first: Promise<string | undefined> = Promise.resolve(undefined);
    let secondResult: string | undefined = "unset";
    await act(async () => {
      first = api!.run(task);
      secondResult = await api!.run(task);
    });
    expect(secondResult).toBeUndefined();
    expect(task).toHaveBeenCalledTimes(1);
    expect(q("pending")?.textContent).toBe("1");

    let firstResult: string | undefined;
    await act(async () => {
      resolve("ok");
      firstResult = await first;
    });
    expect(firstResult).toBe("ok");
    expect(q("pending")?.textContent).toBe("0");

    const next = vi.fn(async () => "again");
    let nextResult: string | undefined;
    await act(async () => {
      nextResult = await api!.run(next);
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(nextResult).toBe("again");
  });

  it("releases the guard when the task throws", async () => {
    let api: ReturnType<typeof useMypageSubmitGuard> | null = null;
    function Probe() {
      const g = useMypageSubmitGuard();
      useEffect(() => {
        api = g;
      });
      return null;
    }
    mount(<Probe />);
    let caught: unknown = null;
    await act(async () => {
      try {
        await api!.run(() => Promise.reject(new Error("x")));
      } catch (e) {
        caught = e;
      }
    });
    expect((caught as Error | null)?.message).toBe("x");
    const ok = vi.fn(async () => 1);
    await act(async () => {
      await api!.run(ok);
    });
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe("useMypageTabParam", () => {
  const TABS = ["received", "sent"] as const;
  let current: readonly [string, (n: (typeof TABS)[number]) => void] | null = null;
  function Probe({ k }: { k?: string }) {
    const r = useMypageTabParam({ values: TABS, defaultValue: "received", key: k });
    useEffect(() => {
      current = r;
    });
    return <span data-testid="tab">{r[0]}</span>;
  }

  it("reads the URL value and falls back to default for unknown values", () => {
    search = "tab=sent";
    mount(<Probe />);
    expect(q("tab")?.textContent).toBe("sent");

    act(() => root!.unmount());
    root = createRoot(host!);
    search = "tab=bogus";
    mount(<Probe />);
    expect(q("tab")?.textContent).toBe("received");
  });

  it("writes with history.replaceState (no new entry) and drops the param for default", () => {
    window.history.replaceState(null, "", "/mypage/offers?x=1");
    const lengthBefore = window.history.length;
    const spy = vi.spyOn(window.history, "replaceState");
    mount(<Probe />);
    act(() => current![1]("sent"));
    expect(q("tab")?.textContent).toBe("sent");
    expect(window.location.search).toBe("?x=1&tab=sent");
    expect(spy).toHaveBeenCalledWith(null, "", "/mypage/offers?x=1&tab=sent");

    act(() => current![1]("received"));
    expect(q("tab")?.textContent).toBe("received");
    expect(window.location.search).toBe("?x=1");
    expect(window.history.length).toBe(lengthBefore);
    spy.mockRestore();
  });

  it("supports a custom key (legacy filter/couponTab)", () => {
    window.history.replaceState(null, "", "/mypage/coupons");
    mount(<Probe k="couponTab" />);
    act(() => current![1]("sent"));
    expect(window.location.search).toBe("?couponTab=sent");
  });
});

describe("MyToggle", () => {
  it("reverts and shows an error toast when save fails", async () => {
    const events: string[] = [];
    const onToast = (e: Event) => events.push((e as CustomEvent<{ tone: string }>).detail.tone);
    window.addEventListener(MYPAGE_TOAST_EVENT, onToast);
    const onChange = vi.fn(async () => false);
    mount(<MyToggle checked={false} onChange={onChange} ariaLabel="알림" />);
    click(q("my-toggle"));
    await flush();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(q("my-toggle")?.getAttribute("aria-checked")).toBe("false");
    expect(events).toEqual(["error"]);
    window.removeEventListener(MYPAGE_TOAST_EVENT, onToast);
  });

  it("shows optimistic value and is disabled while saving", async () => {
    let resolve: (v: boolean) => void = () => undefined;
    mount(<MyToggle checked={false} onChange={() => new Promise<boolean>((r) => (resolve = r))} ariaLabel="알림" />);
    click(q("my-toggle"));
    expect(q("my-toggle")?.getAttribute("aria-checked")).toBe("true");
    expect((q("my-toggle") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      resolve(true);
    });
    expect((q("my-toggle") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("MyRow (MyInfoMenuItem extension)", () => {
  it("shows value and chevron together, loading placeholder, and badge", () => {
    mount(<MyRow title="포인트" href="/mypage/points" value="1,200P" badge={{ count: 120, tone: "danger" }} />);
    expect(host!.querySelector("[data-row-value='ready']")?.textContent).toBe("1,200P");
    expect(host!.querySelector("svg")).not.toBeNull();
    expect(host!.querySelector("[data-row-badge='danger']")?.textContent).toBe("99+");

    mount(<MyRow title="포인트" href="/mypage/points" valueState="loading" />);
    expect(host!.querySelector("[data-row-value='loading'] span")).not.toBeNull();

    mount(<MyRow title="쿠폰" href="/mypage/coupons" badge={{ count: 0, tone: "primary" }} />);
    expect(host!.querySelector("[data-row-badge]")).toBeNull();
  });

  it("keeps legacy accessory + trailing=value behavior (no chevron)", () => {
    mount(<MyRow title="언어" href="#" accessory="한국어" trailing="value" />);
    expect(host!.querySelector("[data-trailing='value']")?.textContent).toBe("한국어");
    expect(host!.querySelector("svg")).toBeNull();
  });
});

describe("MyScreen", () => {
  it("renders state view in place of children using the screen template", () => {
    mount(
      <MyScreen title="가격 제안" template="list" state={{ kind: "loading", rows: 2 }}>
        <p data-testid="body">body</p>
      </MyScreen>
    );
    expect(q("header")?.textContent).toBe("가격 제안");
    expect(q("body")).toBeNull();
    expect(q("my-state-loading")?.getAttribute("data-template")).toBe("list");
    expect(host!.querySelectorAll("[data-skeleton-row]")).toHaveLength(2);

    mount(
      <MyScreen title="가격 제안" template="list">
        <p data-testid="body">body</p>
      </MyScreen>
    );
    expect(q("body")).not.toBeNull();
  });

  it("applies the 16/20px gutter exactly once (no app feed gutter around the column) — v3 §2", () => {
    mount(
      <MyScreen title="가격 제안" template="list">
        <p data-testid="body">body</p>
      </MyScreen>
    );
    const body = q("body")!;
    const chain: string[] = [];
    for (let el: HTMLElement | null = body.parentElement; el && el !== host; el = el.parentElement) {
      chain.push(el.className);
    }
    const joined = chain.join(" ");
    expect(joined.match(/\bpx-4\b/g)).toHaveLength(1);
    expect(joined.match(/\bmd:px-5\b/g)).toHaveLength(1);
    expect(joined).not.toContain("pl-[10px]");
    expect(joined).toContain("max-w-[40rem]");
  });

  it("CTA body clearance follows the bottom tab bar (tab + CTA + safe)", () => {
    mount(
      <BottomNavScrollChromeProvider hidden={false} occupiesClearance>
        <MyScreen title="t" template="form" stickyCta={<MyStickyCta dirty primary={{ label: "저장", onPress: () => undefined }} />}>
          <p data-testid="body">body</p>
        </MyScreen>
      </BottomNavScrollChromeProvider>
    );
    expect(q("body")!.parentElement!.className).toContain("pb-[calc(var(--sam-button-min-height,46px)+20px)]");
    const bar = q("my-sticky-cta")!;
    expect(bar.getAttribute("data-above-bottom-nav")).toBe("1");
    expect(bar.className).toContain("sam-fixed-bottom-bar");
  });
});

describe("MypageToastHost action", () => {
  it("plain toast keeps the legacy API (no action button)", () => {
    vi.useFakeTimers();
    mount(<MypageToastHost />);
    act(() => showMypageToast("저장했어요"));
    expect(q("mypage-toast")?.textContent).toContain("저장했어요");
    expect(q("mypage-toast-action")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(3000 + MYPAGE_TOAST_MOTION_MS);
    });
    expect(q("mypage-toast")).toBeNull();
  });

  it("undo toast invokes the action once and closes; stays 5s otherwise", () => {
    vi.useFakeTimers();
    const onUndo = vi.fn();
    mount(<MypageToastHost />);
    act(() => showMypageUndoToast("찜을 해제했어요", onUndo));
    const btn = q("mypage-toast-action");
    expect(btn).not.toBeNull();
    expect(btn?.textContent?.trim().length).toBeGreaterThan(0);
    click(btn);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(q("mypage-toast")).toBeNull();

    act(() => showMypageToast("좋아요를 해제했어요", "success", { action: { label: "되돌리기", onPress: onUndo } }));
    expect(q("mypage-toast-action")?.textContent).toBe("되돌리기");
    act(() => {
      vi.advanceTimersByTime(3000 + MYPAGE_TOAST_MOTION_MS);
    });
    expect(q("mypage-toast")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(MYPAGE_TOAST_ACTION_MS - 3000);
    });
    expect(q("mypage-toast")).toBeNull();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
