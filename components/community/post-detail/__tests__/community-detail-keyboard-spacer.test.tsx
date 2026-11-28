// @vitest-environment jsdom
/** 키보드 가림 칸 — Android(가림 0)는 아무것도 그리지 않고, 키보드가 덮는 기기(iOS)는 가림 높이만큼만 둔다. 동작 시험. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const snap = { keyboardOpen: false, keyboardOcclusionInset: 0 };
vi.mock("@/lib/ui/use-form-keyboard-viewport", () => ({ useFormKeyboardViewport: () => snap }));

import { CommunityDetailKeyboardSpacer } from "@/components/community/post-detail/community-detail-keyboard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

async function render(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(<CommunityDetailKeyboardSpacer />);
  });
  return host;
}

describe("CommunityDetailKeyboardSpacer", () => {
  it("키보드 닫힘 → 그리지 않음", async () => {
    Object.assign(snap, { keyboardOpen: false, keyboardOcclusionInset: 300 });
    expect((await render()).innerHTML).toBe("");
  });

  it("키보드 열림·가림 0 (Android 화면 줄어듦) → 그리지 않음", async () => {
    Object.assign(snap, { keyboardOpen: true, keyboardOcclusionInset: 0 });
    expect((await render()).innerHTML).toBe("");
  });

  it("키보드 열림·가림 336.4 (iOS 덮음) → 336px 칸", async () => {
    Object.assign(snap, { keyboardOpen: true, keyboardOcclusionInset: 336.4 });
    const el = (await render()).firstElementChild as HTMLElement;
    expect(el.style.height).toBe("336px");
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });
});
