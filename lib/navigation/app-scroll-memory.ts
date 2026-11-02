"use client";

/**
 * 앱 전체 스크롤 위치 규칙 1개 (Owner 승인 2026-11-03, `docs/audit/dibay-scroll-tab-back-ssot-audit-design-2026-11-03.md`).
 * 2026-11-02 내정보에서 실기 PASS 한 규칙(`mypage-scroll-memory`)을 앱 전체로 올렸다. 도메인별 복원 방식은 쓰지 않는다.
 *
 * | 상황 | 동작 |
 * |---|---|
 * | 상세에서 뒤로(기기·브라우저·헤더 ‹) | 이전 화면 위치 복원 (P1) |
 * | 하단 탭 전환 후 복귀 | 그 탭 마지막 화면·위치 복원 (P2) |
 * | 현재 탭 다시 누르기 | 그 탭 최상위 화면 맨 위 (P3) |
 * | 새 화면(링크·카드) | 맨 위 (P4) |
 * | 같은 화면 안 탭·필터 주소만 바뀜 | 스크롤 건드리지 않음(화면이 정함) |
 * | 앱 완전 종료 후 재실행 | sessionStorage 가 비어 기본 상태 (P7) |
 *
 * 위치 = {보던 항목(첫 번째로 보이는 링크/`data-scroll-anchor`) + 그 항목의 위쪽 간격, 좌표(예비)}.
 * 목록이 바뀌어도 그 항목을 찾아 돌아가고, 항목이 사라졌으면 좌표로, 높이가 부족하면 늘어날 때까지 기다린다 (P8).
 */
import {
  getMainAppScrollRoot,
  setMainAppScrollTop,
} from "@/lib/layout/main-app-scroll-root";
import { isStoreConsumerDetailPath } from "@/lib/dibay/delivery-list-scroll-restore";

const KEY_PREFIX = "dibay:app-scroll:";
const STACK_KEY = "dibay:app-scroll-stack";
const STACK_MAX = 40;
/** 세션 안에서만 — 30분 지나면 버림 */
export const APP_SCROLL_TTL_MS = 30 * 60_000;
/** 화면 전환·늦게 그려지는 목록을 기다리는 최대 시간 */
const RESTORE_WINDOW_MS = 3000;
/** 목표에 닿은 뒤 이만큼 유지되면 종료 */
const RESTORE_SETTLE_MS = 500;
/** 하단 탭·뒤로 신호 유효 시간 */
const INTENT_TTL_MS = 2500;

/** 자체 스크롤 상자를 가진 화면(메신저 목록 등) — 셸 본문 대신 이 상자를 쓴다 */
export const APP_SCROLL_OWNER_ATTR = "data-app-scroll-owner";
const ANCHOR_SELECTOR = "[data-scroll-anchor], a[href]";

/** 자체 복원 계약이 있는 화면은 제외 — 메신저 방 타임라인·알림함·운영/관리 */
const EXCLUDED_PREFIXES = [
  "/community-messenger/rooms",
  "/community-messenger/calls",
  "/chats/",
  "/notifications",
  "/admin",
  "/stores/owner",
  "/login",
];

/**
 * 배달 browse ↔ 매장 상세는 `DeliveryPresentationShell` 이 슬라이드 애니메이션 오프셋과 함께 위치를 소유한다
 * (browse 위치를 들고 매장으로 밀었다가 뒤로 그 위치로 되돌림) — 두 장치가 같은 화면을 움직이지 않게 제외.
 */
function isDeliveryPresentationOwnedPath(p: string): boolean {
  return /^\/stores\/browse\/[^/]+$/.test(p) || isStoreConsumerDetailPath(p);
}

export function isAppScrollMemoryPath(pathname: string): boolean {
  const p = pathname || "/";
  if (isDeliveryPresentationOwnedPath(p)) return false;
  return !EXCLUDED_PREFIXES.some((x) => p === x.replace(/\/$/, "") || p.startsWith(x.endsWith("/") ? x : `${x}/`));
}

export function appScrollKey(pathname: string, search: string): string {
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  const sorted = [...params.entries()].sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const q = new URLSearchParams(sorted).toString();
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  return q ? `${path}?${q}` : path;
}

function pathOfKey(key: string): string {
  return key.split("?")[0] ?? key;
}

// ─── 이동 신호 (하단 탭·헤더 뒤로) ─────────────────────────────────────────

export type AppScrollNavIntent = "tab-switch" | "tab-reselect" | "back";
let pendingIntent: { kind: AppScrollNavIntent; at: number } | null = null;

/** 하단 탭 커밋·뒤로 버튼이 이동 직전에 부른다 */
export function markAppScrollNavIntent(kind: AppScrollNavIntent): void {
  pendingIntent = { kind, at: Date.now() };
}

function takeIntent(now: number): AppScrollNavIntent | null {
  const i = pendingIntent;
  pendingIntent = null;
  return i && now - i.at <= INTENT_TTL_MS ? i.kind : null;
}

// ─── 방문 순서 (뒤로 / 새 진입 판정) ───────────────────────────────────────

type StackEntry = { k: string; h: number };

function readStack(): StackEntry[] {
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v)
      ? v.filter((x): x is StackEntry => !!x && typeof (x as StackEntry).k === "string" && typeof (x as StackEntry).h === "number")
      : [];
  } catch {
    return [];
  }
}

function writeStack(stack: StackEntry[]): void {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-STACK_MAX)));
  } catch {
    /* quota */
  }
}

export type AppScrollVisit = "return" | "new" | "top" | "inplace";

/**
 * 이번 화면 진입 판정.
 * - `top`: 현재 탭 다시 누르기(하위 화면 → 탭 최상위)
 * - `return`: 뒤로(바로 전 화면으로, 기록 길이 그대로 또는 뒤로 신호) · 하단 탭 복귀 · 같은 화면 재그림
 * - `inplace`: 같은 화면에서 주소의 검색 조건만 바뀜(화면 안 탭·필터) — 스크롤을 건드리지 않는다
 * - `new`: 그 외(링크 push) — 맨 위
 * 기록 길이(`history.length`)를 함께 적어, 바로 전 화면으로 **링크 push** 한 경우를 뒤로와 구분한다(2026-11-02 내정보 규칙 허점 M-2).
 */
export function noteAppScrollVisit(key: string, historyLength: number, now = Date.now()): AppScrollVisit {
  const intent = takeIntent(now);
  const stack = readStack();
  const top = stack[stack.length - 1];
  const prev = stack[stack.length - 2];

  if (intent === "tab-reselect") {
    stack.push({ k: key, h: historyLength });
    writeStack(stack);
    return "top";
  }
  if (top?.k === key) return "return";
  if (intent === "tab-switch") {
    stack.push({ k: key, h: historyLength });
    writeStack(stack);
    return "return";
  }
  if (prev?.k === key && (intent === "back" || historyLength <= top!.h)) {
    stack.pop();
    writeStack(stack);
    return "return";
  }
  if (top && pathOfKey(top.k) === pathOfKey(key) && historyLength <= top.h) {
    stack[stack.length - 1] = { k: key, h: historyLength };
    writeStack(stack);
    return "inplace";
  }
  stack.push({ k: key, h: historyLength });
  writeStack(stack);
  return "new";
}

// ─── 위치 저장·복원 ────────────────────────────────────────────────────────

export type AppScrollSnapshot = { y: number; anchor: string | null; offset: number; at: number };

/** 화면의 스크롤 상자 — 자체 상자(메신저 목록) 우선, 없으면 셸 본문 */
export function getAppScrollRoot(): HTMLElement {
  const owners = document.querySelectorAll<HTMLElement>(`[${APP_SCROLL_OWNER_ATTR}]`);
  for (const el of owners) {
    if (el.isConnected && el.clientHeight > 0) return el;
  }
  return getMainAppScrollRoot();
}

function isDocumentRoot(root: HTMLElement): boolean {
  return root === document.documentElement || root === document.body;
}

function rootTopPx(root: HTMLElement): number {
  return isDocumentRoot(root) ? 0 : root.getBoundingClientRect().top;
}

function rootScrollTop(root: HTMLElement): number {
  return isDocumentRoot(root) ? window.scrollY || document.documentElement.scrollTop || 0 : root.scrollTop;
}

function setRootScrollTop(root: HTMLElement, y: number): void {
  if (root.hasAttribute(APP_SCROLL_OWNER_ATTR)) {
    root.scrollTop = y;
    return;
  }
  setMainAppScrollTop(y, { behavior: "auto", scrollRoot: root });
}

function anchorIdOf(el: Element): string | null {
  const explicit = el.getAttribute("data-scroll-anchor");
  if (explicit) return `a:${explicit}`;
  const href = el.getAttribute("href");
  return href ? `h:${href}` : null;
}

/** 보이는 첫 항목 — 스크롤 상자 위쪽 아래에 걸친 첫 링크/앵커 */
function findTopAnchor(root: HTMLElement): { id: string; offset: number } | null {
  const top = rootTopPx(root);
  const scope = isDocumentRoot(root) ? document : root;
  for (const el of scope.querySelectorAll(ANCHOR_SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (r.height <= 0 || r.bottom <= top + 1) continue;
    const id = anchorIdOf(el);
    if (!id) continue;
    return { id, offset: Math.round(r.top - top) };
  }
  return null;
}

function findAnchorElement(root: HTMLElement, id: string): Element | null {
  const scope = isDocumentRoot(root) ? document : root;
  const value = id.slice(2);
  try {
    return id.startsWith("a:")
      ? scope.querySelector(`[data-scroll-anchor="${CSS.escape(value)}"]`)
      : scope.querySelector(`a[href="${CSS.escape(value)}"]`);
  } catch {
    return null;
  }
}

export function captureAppScroll(root: HTMLElement): Omit<AppScrollSnapshot, "at"> {
  const y = Math.max(0, Math.round(rootScrollTop(root)));
  const a = y > 0 ? findTopAnchor(root) : null;
  return { y, anchor: a?.id ?? null, offset: a?.offset ?? 0 };
}

export function saveAppScroll(key: string, snap: Omit<AppScrollSnapshot, "at">, now = Date.now()): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + key, JSON.stringify({ ...snap, at: now }));
  } catch {
    /* quota */
  }
}

export function readAppScroll(key: string, now = Date.now()): AppScrollSnapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<AppScrollSnapshot>;
    if (!v?.at || v.at + APP_SCROLL_TTL_MS < now) {
      sessionStorage.removeItem(KEY_PREFIX + key);
      return null;
    }
    return {
      y: Math.max(0, Math.round(Number(v.y) || 0)),
      anchor: typeof v.anchor === "string" ? v.anchor : null,
      offset: Math.round(Number(v.offset) || 0),
      at: v.at,
    };
  } catch {
    return null;
  }
}

export function ensureAppScrollManualRestoration(): void {
  try {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  } catch {
    /* ignore */
  }
}

/**
 * 저장 위치로 — 화면 전환 애니메이션·늦게 커지는 목록이 위치를 덮어쓰므로,
 * 목표에 닿아 0.5초 유지될 때까지(최대 3초) 매 프레임 다시 맞춘다. 사용자가 손대면(터치·휠·키) 즉시 멈춘다.
 * 목표 = 보던 항목이 있으면 그 항목 기준, 없으면 좌표.
 */
export function restoreAppScroll(snap: AppScrollSnapshot): () => void {
  let raf = 0;
  let cancelled = false;
  const started = performance.now();
  let reachedAt: number | null = null;
  const stop = () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("touchstart", stop, true);
    window.removeEventListener("wheel", stop, true);
    window.removeEventListener("keydown", stop, true);
  };
  window.addEventListener("touchstart", stop, { capture: true, passive: true });
  window.addEventListener("wheel", stop, { capture: true, passive: true });
  window.addEventListener("keydown", stop, true);
  const tick = () => {
    if (cancelled) return;
    const root = getAppScrollRoot();
    const current = rootScrollTop(root);
    let target = snap.y;
    if (snap.anchor) {
      const el = findAnchorElement(root, snap.anchor);
      if (el) target = Math.max(0, Math.round(current + (el.getBoundingClientRect().top - rootTopPx(root)) - snap.offset));
    }
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    const want = Math.min(target, max);
    if (Math.abs(current - want) > 1) setRootScrollTop(root, want);
    const now = performance.now();
    const atTarget = max + 1 >= target && Math.abs(rootScrollTop(root) - target) <= 1;
    if (atTarget) reachedAt ??= now;
    else reachedAt = null;
    const settled = reachedAt != null && now - reachedAt >= RESTORE_SETTLE_MS;
    if (!settled && now - started < RESTORE_WINDOW_MS) raf = requestAnimationFrame(tick);
    else stop();
  };
  tick();
  return stop;
}

/** 맨 위로 — 셸 본문과 자체 스크롤 상자 모두 */
export function scrollAppToTop(): void {
  const root = getAppScrollRoot();
  setRootScrollTop(root, 0);
  const main = getMainAppScrollRoot();
  if (main !== root) setMainAppScrollTop(0, { behavior: "auto", scrollRoot: main });
}

export function resetAppScrollMemoryForTests(): void {
  pendingIntent = null;
}
