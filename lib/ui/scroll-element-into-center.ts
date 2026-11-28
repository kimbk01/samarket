/**
 * 요소를 「가장 가까운 스크롤 영역」 안에서만 가운데로 옮긴다.
 *
 * `Element.scrollIntoView` 는 조상 전부(문서 `html`·`body` 포함)를 움직인다. 앱 셸은 본문 스크롤 영역만 움직여야 하는데,
 * 문서까지 밀리면 머리글이 상태 표시줄 밑으로 들어가고 하단 탭이 화면 밖으로 밀린다
 * (라운지 댓글 실기 2026-11-28 Samsung 13:47 PHT — 답글 게시 후 화면 전체가 밀렸다가 맨 위로 돌아감).
 */
function isScrollableY(el: Element): boolean {
  if (typeof window === "undefined") return false;
  const oy = window.getComputedStyle(el).overflowY;
  return (oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 1;
}

export function findNearestScrollableAncestor(el: Element): Element | null {
  let cur = el.parentElement;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    if (isScrollableY(cur)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function scrollElementIntoCenter(
  el: Element,
  opts?: { behavior?: ScrollBehavior; block?: "center" | "start" }
): void {
  const behavior = opts?.behavior ?? "smooth";
  const block = opts?.block ?? "center";
  const rect = el.getBoundingClientRect();
  const container = findNearestScrollableAncestor(el);
  if (container) {
    const cRect = container.getBoundingClientRect();
    const offset = rect.top - cRect.top + container.scrollTop;
    const top =
      block === "center" ? offset - container.clientHeight / 2 + rect.height / 2 : offset - 16;
    container.scrollTo({ top: Math.max(0, top), behavior });
    return;
  }
  /** 셸 스크롤 영역이 없으면(문서가 스크롤) 문서만 — 다른 조상은 건드리지 않는다 */
  const offset = rect.top + window.scrollY;
  const top = block === "center" ? offset - window.innerHeight / 2 + rect.height / 2 : offset - 16;
  window.scrollTo({ top: Math.max(0, top), behavior });
}
