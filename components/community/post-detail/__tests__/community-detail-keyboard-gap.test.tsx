// @vitest-environment jsdom
/**
 * 라운지 글 상세 키보드 여백 보정 — 실측 2026-11-28 Xiaomi:
 * ① 키보드 열림 때 입력칸 위 빈 띠 132px(셸 탭 여백 92 + 상세 여백 40)
 * ② #701 실패: 키보드가 닫혀 화면이 먼저 커질 때 여백이 접힌 채라 스크롤이 줄어든 끝(826)으로 잘리고, 0.08초 뒤 여백이 돌아와
 *    입력칸이 하단 탭 뒤(986, 탭 931~)에 남았다.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS } from "@/lib/main-menu/bottom-nav-config";

const snap = { keyboardOpen: false, keyboardOcclusionInset: 0 };
vi.mock("@/lib/ui/use-form-keyboard-viewport", () => ({ useFormKeyboardViewport: () => snap }));

import {
  COMMUNITY_DETAIL_KB_COLLAPSE_MARGIN,
  CommunityDetailKeyboardGap,
  isKeyboardCloseGrow,
} from "@/components/community/post-detail/community-detail-keyboard-gap";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  Object.assign(snap, { keyboardOpen: false, keyboardOcclusionInset: 0 });
});

/**
 * 셸 스크롤 영역 흉내 — 내용 높이 = 기본 내용 + 상세 여백(접힘 반영), 스크롤 위치는 브라우저처럼 끝으로 잘린다.
 * 실측값: 닫힘 화면 925 / 열림 605, 접히지 않은 내용 1884, 접는 양 132.
 */
function buildShell() {
  const main = document.createElement("main");
  main.style.overflowY = "auto";
  const root = document.createElement("div");
  const article = document.createElement("article");
  root.appendChild(article);
  main.appendChild(root);
  document.body.appendChild(main);
  const state = { clientHeight: 925, scrollTop: 0 };
  const contentHeight = () => (root.style.marginBottom ? 1752 : 1884) + (parseFloat(root.style.paddingBottom) || 0) * (root.style.marginBottom ? 1 : 0);
  const max = () => Math.max(0, contentHeight() - state.clientHeight);
  Object.defineProperty(main, "scrollHeight", { get: contentHeight });
  Object.defineProperty(main, "clientHeight", { get: () => state.clientHeight });
  Object.defineProperty(main, "scrollTop", {
    get: () => Math.min(state.scrollTop, max()),
    set: (v: number) => {
      state.scrollTop = Math.max(0, Math.min(v, max()));
    },
  });
  /** 화면 크기 변경 — 브라우저처럼 스크롤 위치를 지금 내용 기준으로 자른다 */
  const resize = (innerHeight: number, clientHeight: number) => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: innerHeight });
    state.clientHeight = clientHeight;
    state.scrollTop = Math.min(state.scrollTop, max());
  };
  return { main, root, article, state, resize, max };
}

async function mount(shell: ReturnType<typeof buildShell>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host);
  const rootRef = { current: shell.root as HTMLElement };
  const articleRef = { current: shell.article as HTMLElement };
  const render = async () =>
    act(async () => {
      r.render(<CommunityDetailKeyboardGap rootRef={rootRef} articleRef={articleRef} />);
    });
  await render();
  return { render, unmount: () => act(async () => r.unmount()) };
}

describe("라운지 상세 키보드 여백 보정", () => {
  it("접는 값 = 셸 스크롤 본문 하단 여백(탭 clearance + 16px)의 음수", () => {
    const shell = MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS.match(/^pb-\[calc\((.+)\)\]$/)?.[1];
    expect(shell).toBe("var(--app-bottom-nav-clearance)+16px");
    expect(COMMUNITY_DETAIL_KB_COLLAPSE_MARGIN.replace(/\s/g, "")).toBe(`calc(-1*(${shell}))`);
  });

  it("키보드가 닫히는 판정 — 100px 넘게 커질 때만", () => {
    expect(isKeyboardCloseGrow(686, 1006)).toBe(true);
    expect(isKeyboardCloseGrow(1006, 1056)).toBe(false);
    expect(isKeyboardCloseGrow(1006, 686)).toBe(false);
  });

  it("끝에서 열고 닫기 — 열림 때 접히고, 화면이 커지는 즉시 되돌려 끝(=열기 전 자리)에 둔다 (#701 재현 막기)", async () => {
    const s = buildShell();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1006 });
    s.main.scrollTop = 1e6;
    expect(s.main.scrollTop).toBe(959); // 열기 전 끝
    const m = await mount(s);

    // 키보드 열림: 화면 605 로 줄고, 공용 측정값이 열림
    s.resize(686, 605);
    window.dispatchEvent(new Event("resize")); // 키보드 열림 — 화면 줄어듦
    Object.assign(snap, { keyboardOpen: true, keyboardOcclusionInset: 0 });
    await m.render();
    expect(s.root.style.marginBottom).toBe(COMMUNITY_DETAIL_KB_COLLAPSE_MARGIN);
    expect(s.article.style.paddingBottom).toBe("0px");
    s.main.scrollTop = 1e6; // 공용 포커스 보정이 끝까지 내림
    expect(s.main.scrollTop).toBe(1752 - 605); // 빈 띠 없이 끝 = 접힌 내용 끝

    // 키보드 닫힘: 화면이 먼저 커짐(공용 측정값은 아직 열림) → 브라우저가 접힌 끝(827)으로 자름 → 크기 변경 이벤트에서 즉시 되돌림
    s.resize(1006, 925);
    expect(s.main.scrollTop).toBe(1752 - 925);
    window.dispatchEvent(new Event("resize"));
    expect(s.root.style.marginBottom).toBe("");
    expect(s.main.scrollTop).toBe(959); // 열기 전과 같은 자리

    // 두 프레임 뒤 공용 측정값 닫힘 — 다시 건드리지 않음
    Object.assign(snap, { keyboardOpen: false });
    await m.render();
    expect(s.main.scrollTop).toBe(959);
    await m.unmount();
  });

  it("끝이 아닌 곳에서 닫기 — 스크롤 위치를 건드리지 않는다", async () => {
    const s = buildShell();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 686 });
    const m = await mount(s);
    s.resize(686, 605);
    window.dispatchEvent(new Event("resize")); // 키보드 열림 — 화면 줄어듦
    Object.assign(snap, { keyboardOpen: true });
    await m.render();
    s.main.scrollTop = 400;
    s.resize(1006, 925);
    window.dispatchEvent(new Event("resize"));
    expect(s.root.style.marginBottom).toBe("");
    expect(s.main.scrollTop).toBe(400);
    await m.unmount();
  });

  it("화면 크기가 안 변하는 기기(iOS) — 가림 높이만큼 아래 칸, 공용 측정값 닫힘으로 되돌리고 끝 유지", async () => {
    const s = buildShell();
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1006 });
    const m = await mount(s);
    Object.assign(snap, { keyboardOpen: true, keyboardOcclusionInset: 336.4 });
    await m.render();
    expect(s.root.style.paddingBottom).toBe("336px");
    s.main.scrollTop = 1e6;
    Object.assign(snap, { keyboardOpen: false, keyboardOcclusionInset: 0 });
    await m.render();
    expect(s.root.style.paddingBottom).toBe("");
    expect(s.main.scrollTop).toBe(959);
    await m.unmount();
  });

  it("상세를 떠나면 여백을 원래대로", async () => {
    const s = buildShell();
    const m = await mount(s);
    Object.assign(snap, { keyboardOpen: true });
    await m.render();
    expect(s.root.style.marginBottom).not.toBe("");
    await m.unmount();
    expect(s.root.style.marginBottom).toBe("");
  });
});
