/**
 * JS·CSS 조각 받기 멈춤 관찰 — 설계 `docs/audit/idle-menu-freeze-design-2026-11-22.md` §S1 (관찰만).
 *
 * 사실(감사 F4): Turbopack 은 조각을 `<script>`·`<link rel=stylesheet>` 를 `document.head` 에 붙여 받으며 시간 제한이 없고,
 * 시작한 받기를 주소별로 기억해 다시 쓴다(빌드 결과물 `turbopack-*.js` `loadChunkCached`) → 멈춘 조각은 같은 문서에서 다시 받을 수 없다.
 *
 * 계약:
 * - **관찰만.** 새로고침·오류 화면 등 동작을 바꾸지 않는다(멈춤 처리 = S4, 이 기록의 실측으로 상한을 정한 뒤).
 * - 관찰 대상 = `document.head` 의 직접 자식 추가만(body 전체 관찰 금지 — 11-10 F 결함) · 주소에 `/_next/static/` 이 든 것만.
 * - `NAVIGATION_STALL_DEADLINE_MS` 안에 load·error 가 오지 않은 조각이 생기면, 끝났을 때(load·error) 또는 문서가 사라질 때(pagehide)
 *   실제 기다린 시간으로 `chunk_stall` 1건. 문서당 1건.
 * - 이미 문서에 있던(설치 전) 조각은 대상이 아니다 — 시작 전 멈춤은 네이티브 T_doc·초기 가드가 맡는다.
 */
import { NAVIGATION_STALL_DEADLINE_MS, navigationStallTarget } from "@/lib/net/navigation-stall-policy";
import { noteNavigationStall } from "@/lib/telemetry/entry-telemetry.client";
import type { EntryStallResult } from "@/lib/telemetry/entry-telemetry-contract";

export type ChunkStallReport = { waitedMs: number; result: EntryStallResult; target: string };

export type ChunkStallObserverDeps = {
  thresholdMs: number;
  now: () => number;
  report: (r: ChunkStallReport) => void;
  currentPathname: () => string;
};

/** 관찰 대상 조각 요소의 주소 — 아니면 null */
export function chunkUrlOf(node: Node): string | null {
  const el = node as Element;
  if (!el || el.nodeType !== 1) return null;
  const tag = el.tagName;
  let url = "";
  if (tag === "SCRIPT") url = (el as HTMLScriptElement).src || "";
  else if (tag === "LINK" && String((el as HTMLLinkElement).rel || "").toLowerCase() === "stylesheet")
    url = (el as HTMLLinkElement).href || "";
  else return null;
  return url.includes("/_next/static/") ? url : null;
}

type Tracked = { startedAt: number; stalled: boolean; timer: ReturnType<typeof setTimeout> | null };

/** head 관찰 시작 — 정리 함수 반환. 시험에서 직접 부른다. */
export function startChunkStallObserver(head: HTMLElement, deps: ChunkStallObserverDeps): () => void {
  let reported = false;
  const tracked = new Map<Element, Tracked>();

  const finish = (el: Element, result: EntryStallResult) => {
    const t = tracked.get(el);
    if (!t) return;
    tracked.delete(el);
    if (t.timer != null) clearTimeout(t.timer);
    if (!t.stalled || reported) return;
    reported = true;
    try {
      deps.report({
        waitedMs: deps.now() - t.startedAt,
        result,
        target: navigationStallTarget(deps.currentPathname()),
      });
    } catch {
      /* 계측 실패는 무시 */
    }
  };

  const track = (el: Element) => {
    if (tracked.has(el) || reported) return;
    const t: Tracked = { startedAt: deps.now(), stalled: false, timer: null };
    t.timer = setTimeout(() => {
      t.timer = null;
      t.stalled = true;
    }, deps.thresholdMs);
    tracked.set(el, t);
    el.addEventListener("load", () => finish(el, "load"), { once: true });
    el.addEventListener("error", () => finish(el, "error"), { once: true });
  };

  const mo = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (chunkUrlOf(n) != null) track(n as Element);
      });
    }
  });
  mo.observe(head, { childList: true });

  const onPageHide = () => {
    for (const el of [...tracked.keys()]) finish(el, "pending");
  };
  window.addEventListener("pagehide", onPageHide);

  return () => {
    mo.disconnect();
    window.removeEventListener("pagehide", onPageHide);
    for (const t of tracked.values()) if (t.timer != null) clearTimeout(t.timer);
    tracked.clear();
  };
}

let installed = false;

/** 문서당 1회 — `AppBootProvider` 모듈 로드 때. 서버에서는 무동작. */
export function installChunkStallObserver(): void {
  try {
    if (installed || typeof window === "undefined" || typeof document === "undefined" || !document.head) return;
    if (typeof MutationObserver !== "function") return;
    installed = true;
    startChunkStallObserver(document.head, {
      thresholdMs: NAVIGATION_STALL_DEADLINE_MS,
      now: () => Date.now(),
      currentPathname: () => window.location.pathname,
      report: ({ waitedMs, result, target }) =>
        noteNavigationStall("chunk_stall", { waitedMs, result, target }, { reloadFollows: false }),
    });
  } catch {
    /* 관찰 실패는 무시 */
  }
}
