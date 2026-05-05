"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RecentKeyword = { keyword: string; normalized: string; created_at?: string };

const LS_KEY = "dibay:delivery:recent_searches:v1";
const MAX_RECENTS = 10;

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
  const [localRows, setLocalRows] = useState<RecentKeyword[]>([]);

  useEffect(() => {
    setLocalRows(readLocalRecents());
  }, []);

  const rows = useMemo(() => localRows.slice(0, MAX_RECENTS), [localRows]);

  const deleteOne = useCallback(
    async (keyword: string) => {
      const n = normalize(keyword);
      if (!n) return;

      setLocalRows((prev) => {
        const next = prev.filter((x) => x.normalized !== n);
        writeLocalRecents(next);
        return next;
      });
    },
    []
  );

  const clearAll = useCallback(async () => {
    setLocalRows(() => {
      writeLocalRecents([]);
      return [];
    });
  }, []);

  if (rows.length === 0) {
    return (
      <section>
        <div className="flex items-center justify-between">
          <h2 className="sam-text-body-secondary font-semibold text-sam-fg">최근 검색어</h2>
        </div>
        <p className="mt-2 sam-text-body text-sam-muted">최근 검색어가 없습니다.</p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h2 className="sam-text-body-secondary font-semibold text-sam-fg">최근 검색어</h2>
        <button type="button" className="sam-text-helper font-semibold text-sam-muted hover:text-sam-fg" onClick={clearAll}>
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
              className="ml-1 text-sam-muted hover:text-sam-fg"
              onClick={() => void deleteOne(r.keyword)}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

