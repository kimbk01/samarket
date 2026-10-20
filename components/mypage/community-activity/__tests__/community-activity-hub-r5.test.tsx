// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityActivityInitial } from "@/components/mypage/community-activity/CommunityActivityHubView";

/** S27 — 해제 [되돌리기](지연 커밋) · 이탈 시 즉시 커밋 · 댓글 삭제는 확인 후에만 */
let search = new URLSearchParams("tab=reactions");
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/mypage/community-activity",
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => <a href={href}>{children as never}</a>,
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/mypage/use-mypage-list-restore", () => ({ useMypageListRestore: () => ({}) }));
const undoToasts: Array<{ onUndo: () => void }> = [];
vi.mock("@/lib/mypage/mypage-toast", () => ({
  showMypageToast: vi.fn(),
  showMypageUndoToast: (_m: string, onUndo: () => void) => undoToasts.push({ onUndo }),
}));
let confirmResult = false;
const dibayConfirm = vi.fn(async () => confirmResult);
vi.mock("@/components/ui/dibay-overlay", () => ({
  dibayConfirm: () => dibayConfirm(),
  DibayActionSheet: ({ open, items }: { open: boolean; items: { key: string; onClick: () => void }[] }) =>
    open ? (
      <div>
        {items.map((it) => (
          <button key={it.key} type="button" data-testid={`sheet-${it.key}`} onClick={it.onClick}>
            {it.key}
          </button>
        ))}
      </div>
    ) : null,
}));

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  undoToasts.length = 0;
  fetchMock.mockClear();
  dibayConfirm.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  const { forgetMypageListCache } = await import("@/lib/mypage/use-mypage-cursor-list");
  forgetMypageListCache();
});
afterEach(() => {
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function render(initial: CommunityActivityInitial) {
  const { CommunityActivityHubView } = await import("@/components/mypage/community-activity/CommunityActivityHubView");
  await act(async () => {
    root.render(<CommunityActivityHubView viewerId="u1" initial={initial} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const reaction = (postId: string, title = `t-${postId}`) => ({
  id: postId,
  postId,
  title,
  regionLabel: null,
  createdAt: "2026-10-20T00:00:00Z",
  postVisible: true,
});

const deleteCalls = () => fetchMock.mock.calls.filter((c) => c[1]?.method === "DELETE");

describe("S27 댓글·반응", () => {
  it("좋아요 해제 → 즉시 제거 + 되돌리기 → DELETE 호출 0, 행 복귀", async () => {
    search = new URLSearchParams("tab=reactions");
    await render({ ok: true, tab: "reactions", items: [reaction("p1"), reaction("p2")], next_cursor: null });
    expect(fetchMock).not.toHaveBeenCalled(); // RSC 첫 페이지 — 추가 요청 없음
    expect(container.textContent).toContain("t-p1");
    await act(async () => {
      (container.querySelector("[data-testid=activity-release-like]") as HTMLButtonElement).click();
    });
    expect(container.textContent).not.toContain("t-p1");
    expect(undoToasts).toHaveLength(1);
    await act(async () => {
      undoToasts[0]!.onUndo();
    });
    expect(container.textContent).toContain("t-p1");
    act(() => root.unmount());
    expect(deleteCalls()).toHaveLength(0);
  });

  it("해제 후 화면 이탈(언마운트) → 즉시 DELETE(keepalive)", async () => {
    search = new URLSearchParams("tab=saved");
    await render({ ok: true, tab: "saved", items: [reaction("p9")], next_cursor: null });
    await act(async () => {
      (container.querySelector("[data-testid=activity-release-save]") as HTMLButtonElement).click();
    });
    expect(deleteCalls()).toHaveLength(0);
    act(() => root.unmount());
    expect(deleteCalls()).toHaveLength(1);
    expect(String(deleteCalls()[0]![0])).toBe("/api/community/posts/p9/save");
    expect(deleteCalls()[0]![1]).toEqual(expect.objectContaining({ keepalive: true }));
  });

  it("볼 수 없는 글은 링크 없음", async () => {
    search = new URLSearchParams("tab=reactions");
    await render({
      ok: true,
      tab: "reactions",
      items: [{ ...reaction("gone", ""), postVisible: false }],
      next_cursor: null,
    });
    expect(container.textContent).toContain("mypage_r5_activity_post_unavailable");
    expect(container.querySelector('a[href="/philife/gone"]')).toBeNull();
    act(() => root.unmount());
  });

  it("댓글 삭제는 확인 후에만 DELETE", async () => {
    search = new URLSearchParams("");
    await render({
      ok: true,
      tab: "comments",
      items: [{ id: "c1", postId: "p1", postTitle: "T", regionLabel: null, content: "hello", createdAt: "2026-10-20T00:00:00Z", postVisible: true }],
      next_cursor: null,
    });
    await act(async () => {
      (container.querySelector("[data-testid=activity-comment-more]") as HTMLButtonElement).click();
    });
    confirmResult = false;
    await act(async () => {
      (container.querySelector("[data-testid=sheet-delete]") as HTMLButtonElement).click();
    });
    expect(dibayConfirm).toHaveBeenCalledTimes(1);
    expect(deleteCalls()).toHaveLength(0);
    await act(async () => {
      (container.querySelector("[data-testid=activity-comment-more]") as HTMLButtonElement).click();
    });
    confirmResult = true;
    await act(async () => {
      (container.querySelector("[data-testid=sheet-delete]") as HTMLButtonElement).click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(String(deleteCalls()[0]![0])).toBe("/api/community/posts/p1/comments/c1");
    expect(container.textContent).not.toContain("hello");
    act(() => root.unmount());
  });
});
