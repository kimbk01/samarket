// @vitest-environment jsdom
/**
 * 라운지 댓글 실기 결함 1 (2026-11-28 Samsung·Xiaomi) — 키보드가 열린 채 「게시」를 누르면 첫 탭이 키보드만 닫고 게시를 놓쳤다.
 * 버튼을 누르는 순간 입력칸 포커스가 남아 있어야 한다(키보드가 닫히며 바가 움직이지 않게). 동작 시험.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ language: "ko", t: (k: string, v?: Record<string, string | number>) => String(translate("ko", k as MessageKey, v) ?? k) }),
}));
vi.mock("@/hooks/use-require-auth-action", () => ({ useRequireAuthAction: () => async () => true }));
vi.mock("@/components/moim/MoimStickyFooter", () => ({
  MoimStickyFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CommunityCommentComposerBar } from "@/components/community/post-detail/CommunityCommentComposerForm";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CommunityCommentComposerBar 게시 버튼", () => {
  it("누르는 순간(pointerdown·mousedown) 입력칸 포커스를 빼앗지 않고, 탭 한 번에 게시한다", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onSubmit = vi.fn();
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <CommunityCommentComposerBar
          value="QA"
          onChange={() => undefined}
          onSubmit={onSubmit}
          busy={false}
          isLoggedIn
          placeholder="p"
          me={null}
          replyTo={null}
          onCancelReply={() => undefined}
          maxLength={500}
        />
      );
    });
    const textarea = host.querySelector("textarea")!;
    textarea.focus();
    expect(document.activeElement).toBe(textarea);
    const button = host.querySelector('button[type="submit"]') as HTMLButtonElement;

    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    button.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    const pdown = new Event("pointerdown", { bubbles: true, cancelable: true });
    button.dispatchEvent(pdown);
    expect(pdown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(textarea);

    await act(async () => {
      button.click();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
