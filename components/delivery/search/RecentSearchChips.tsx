"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RecentKeyword = { keyword: string; normalized: string; created_at?: string };

const LS_KEY = "dibay:delivery:recent_searches:v1";
const MAX_RECENTS = 10;
/** UI-15 — 삭제 후 되돌리기 가능 시간 */
export const RECENT_SEARCH_UNDO_MS = 5000;

function normalize(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 60);
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readLocalRecents(): RecentKeyword[] {
  if (typeof window === "undefined") return [];
  const v = safeParseJson<RecentKeyword[]>(window.localStorage.getItem(LS_KEY));
  if (!Array.isArray(v)) return [];
  const cleaned = v
    .filter((x) => x && typeof x.keyword === "string" && typeof x.normalized === "string")
    .map((x) => ({ keyword: x.keyword.trim(), normalized: x.normalized.trim() }))
    .filter((x) => x.keyword && x.normalized);
  // de-dupe while keeping order
  const seen = new Set<string>();
  const out: RecentKeyword[] = [];
  for (const r of cleaned) {
    const k = r.normalized;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= MAX_RECENTS) break;
  }
  return out;
}

function writeLocalRecents(rows: RecentKeyword[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(0, MAX_RECENTS)));
}

export function RecentSearchChips({ onPick }: { onPick: (keyword: string) => void }) {
  const { t } = useI18n();
  const [localRows, setLocalRows] = useState<RecentKeyword[]>([]);
  /** UI-15 — 확인 없이 지우는 대신 삭제 직전 목록을 잠시 보관해 되돌리기 제공 */
  const [undo, setUndo] = useState<{ prev: RecentKeyword[]; kind: "one" | "all" } | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setLocalRows(readLocalRecents());
  }, []);

  useEffect(
    () => () => {
      if (undoTimerRef.current != null) window.clearTimeout(undoTimerRef.current);
    },
    []
  );

  const rows = useMemo(() => localRows.slice(0, MAX_RECENTS), [localRows]);

  const armUndo = useCallback((prev: RecentKeyword[], kind: "one" | "all") => {
    if (undoTimerRef.current != null) window.clearTimeout(undoTimerRef.current);
    setUndo({ prev, kind });
    undoTimerRef.current = window.setTimeout(() => {
      undoTimerRef.current = null;
      setUndo(null);
    }, RECENT_SEARCH_UNDO_MS);
  }, []);

  const deleteOne = useCallback(
    (keyword: string) => {
      const n = normalize(keyword);
      if (!n) return;
      const prev = localRows;
      const next = prev.filter((x) => x.normalized !== n);
      if (next.length === prev.length) return;
      writeLocalRecents(next);
      setLocalRows(next);
      armUndo(prev, "one");
    },
    [armUndo, localRows]
  );

  const clearAll = useCallback(() => {
    const prev = localRows;
    if (prev.length === 0) return;
    writeLocalRecents([]);
    setLocalRows([]);
    armUndo(prev, "all");
  }, [armUndo, localRows]);

  const restore = useCallback(() => {
    if (!undo) return;
    if (undoTimerRef.current != null) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    writeLocalRecents(undo.prev);
    setLocalRows(undo.prev);
    setUndo(null);
  }, [undo]);

  const undoBar = undo ? (
    <div
      role="status"
      className="mt-2 flex items-center justify-between gap-2 rounded-ui-rect bg-sam-surface-muted px-3"
      data-testid="recent-search-undo"
    >
      <span className="sam-text-helper text-sam-muted">
        {undo.kind === "all" ? t("ui_delivery_search_recent_cleared") : t("ui_delivery_search_recent_deleted")}
      </span>
      <button
        type="button"
        className="inline-flex min-h-[var(--delivery-touch-min)] items-center px-2 sam-text-helper font-semibold text-sam-fg"
        onClick={restore}
      >
        {t("ui_delivery_search_recent_undo")}
      </button>
    </div>
  ) : null;

  if (rows.length === 0) {
    return (
      <section>
        <div className="flex items-center justify-between">
          <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("ui_delivery_search_recent_heading")}</h2>
        </div>
        <p className="mt-2 sam-text-body text-sam-muted">{t("ui_delivery_search_recent_heading")}가 없습니다.</p>
        {undoBar}
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("ui_delivery_search_recent_heading")}</h2>
        <button
          type="button"
          className="inline-flex min-h-[var(--delivery-touch-min)] items-center sam-text-helper font-semibold text-sam-muted hover:text-sam-fg"
          onClick={clearAll}
        >
          전체 삭제
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {rows.map((r) => (
          <li key={r.normalized} className="group inline-flex items-center gap-1 rounded-full border border-sam-border bg-sam-surface px-3 py-1.5">
            <button type="button" className="sam-text-body-secondary font-medium text-sam-fg" onClick={() => onPick(r.keyword)}>
              {r.keyword}
            </button>
            <button
              type="button"
              aria-label={`${r.keyword} 삭제`}
              className="-my-3 -mr-3 ml-0 inline-flex h-[var(--delivery-touch-min)] w-[var(--delivery-touch-min)] items-center justify-center text-sam-muted hover:text-sam-fg"
              onClick={() => deleteOne(r.keyword)}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      {undoBar}
    </section>
  );
}

