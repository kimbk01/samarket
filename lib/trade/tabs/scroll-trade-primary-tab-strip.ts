/**
 * 거래 1차 탭 가로 스트립 정렬 — 커뮤니티 `scrollPhilifeTopicTabStrip` 과 동일 계약.
 * DO NOT: `scrollIntoView` (페이지·셸 스크롤까지 움직임).
 */
export function scrollTradePrimaryTabStrip(
  root: HTMLElement,
  sel: HTMLElement,
  activeIndex: number,
  padPx: number
): void {
  const max = Math.max(0, root.scrollWidth - root.clientWidth);
  const tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
  if (!tabs.length) return;

  const boundary = root.clientWidth - padPx * 2;
  let maxVisibleAtHome = -1;
  for (let i = 0; i < tabs.length; i += 1) {
    const el = tabs[i]!;
    const right = el.offsetLeft + el.offsetWidth;
    if (right <= boundary + 10) maxVisibleAtHome = i;
    else break;
  }
  if (maxVisibleAtHome < 0) maxVisibleAtHome = 0;

  if (activeIndex <= maxVisibleAtHome) {
    if (max > 0) root.scrollTo({ left: 0, behavior: "auto" });
    return;
  }

  if (max <= 0) return;

  const rootRect = root.getBoundingClientRect();
  const selRect = sel.getBoundingClientRect();
  const lo = rootRect.left + padPx;
  const hi = rootRect.right - padPx;

  if (selRect.left >= lo - 0.5 && selRect.right <= hi + 0.5) return;

  if (selRect.right > hi + 0.5) {
    let sl = root.scrollLeft;
    const peel = selRect.right - hi + 6;
    const step = Math.min(max - sl, Math.max(peel, root.clientWidth * 0.68));
    sl = Math.min(max, sl + step);
    root.scrollTo({ left: sl, behavior: "auto" });
    const rr = root.getBoundingClientRect();
    const sr = sel.getBoundingClientRect();
    if (sr.right > rr.right - padPx - 0.5) {
      root.scrollTo({
        left: Math.min(max, root.scrollLeft + (sr.right - (rr.right - padPx) + 4)),
        behavior: "auto",
      });
    }
    return;
  }

  if (selRect.left < lo - 0.5) {
    let x = 0;
    let n: HTMLElement | null = sel;
    while (n && n !== root) {
      x += n.offsetLeft;
      n = n.offsetParent as HTMLElement | null;
    }
    let target: number;
    if (n === root) {
      target = Math.max(0, Math.min(max, x - padPx));
    } else {
      target = Math.max(0, Math.min(max, root.scrollLeft + (selRect.left - rootRect.left) - padPx));
    }
    root.scrollTo({ left: target, behavior: "auto" });
    const rr = root.getBoundingClientRect();
    const sr = sel.getBoundingClientRect();
    if (sr.left < rr.left + padPx - 0.5) {
      root.scrollTo({
        left: Math.max(0, root.scrollLeft - (rr.left + padPx - sr.left + 4)),
        behavior: "auto",
      });
    }
  }
}
