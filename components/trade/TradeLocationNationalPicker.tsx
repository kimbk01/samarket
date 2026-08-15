"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type TradeNationalPickerHit = {
  canonicalId: string;
  displayName: string;
  regionName: string;
  provinceName: string | null;
};

type TradeLocationNationalPickerProps = {
  selectedCanonicalId: string | null;
  onSelect: (hit: TradeNationalPickerHit) => void;
  onBack: () => void;
};

function secondaryLine(hit: TradeNationalPickerHit): string {
  if (hit.provinceName?.trim()) {
    return `${hit.provinceName.trim()} · ${hit.regionName}`;
  }
  return hit.regionName;
}

/**
 * Philippines-wide Trade discovery LGU picker — server search only (no 1642 client bundle).
 * Does not mutate master address.
 */
export function TradeLocationNationalPicker({
  selectedCanonicalId,
  onSelect,
  onBack,
}: TradeLocationNationalPickerProps) {
  const { t } = useI18n();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TradeNationalPickerHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const reqGen = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    const gen = ++reqGen.current;
    setLoading(true);
    const tmr = window.setTimeout(() => {
      void (async () => {
        try {
          const sp = new URLSearchParams({ q, limit: "30" });
          const res = await fetch(`/api/trade/national-lgu?${sp.toString()}`, {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
          });
          if (gen !== reqGen.current) return;
          if (!res.ok) {
            setResults([]);
            setSearched(true);
            return;
          }
          const json = (await res.json()) as {
            results?: Array<{
              canonicalId?: string;
              displayName?: string;
              regionName?: string;
              provinceName?: string | null;
            }>;
          };
          const hits: TradeNationalPickerHit[] = [];
          for (const row of json.results ?? []) {
            if (
              typeof row.canonicalId !== "string" ||
              typeof row.displayName !== "string" ||
              typeof row.regionName !== "string"
            ) {
              continue;
            }
            hits.push({
              canonicalId: row.canonicalId,
              displayName: row.displayName,
              regionName: row.regionName,
              provinceName:
                typeof row.provinceName === "string" ? row.provinceName : null,
            });
          }
          setResults(hits);
          setSearched(true);
        } catch {
          if (gen !== reqGen.current) return;
          setResults([]);
          setSearched(true);
        } finally {
          if (gen === reqGen.current) setLoading(false);
        }
      })();
    }, 220);
    return () => window.clearTimeout(tmr);
  }, [query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-sam-border px-3 py-2">
        <button
          type="button"
          className="min-h-11 shrink-0 px-2 py-2 text-sm font-medium text-sam-primary"
          onClick={onBack}
        >
          {t("trade_location_picker_back")}
        </button>
        <label htmlFor={inputId} className="sr-only">
          {t("trade_location_picker_search_ph")}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("trade_location_picker_search_ph")}
          className="min-h-11 min-w-0 flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg outline-none focus:border-sam-primary"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 pb-[max(1rem,env(safe-area-inset-bottom,0px)+0.5rem)]">
        {query.trim().length < 2 ? (
          <p className="px-2 py-6 text-center text-sm text-sam-fg-muted">
            {t("trade_location_picker_search_hint")}
          </p>
        ) : loading ? (
          <p className="px-2 py-6 text-center text-sm text-sam-fg-muted">
            {t("trade_location_picker_searching")}
          </p>
        ) : searched && results.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-sam-fg-muted">
            {t("trade_location_picker_empty")}
          </p>
        ) : (
          <ul className="space-y-0.5" role="listbox" aria-label={t("trade_location_ph_full")}>
            {results.map((hit) => {
              const on = selectedCanonicalId === hit.canonicalId;
              return (
                <li key={hit.canonicalId} role="option" aria-selected={on}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-start gap-3 rounded-lg px-2 py-3 text-left hover:bg-sam-surface-muted"
                    onClick={() => onSelect(hit)}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        on ? "border-sam-primary bg-sam-primary" : "border-sam-border"
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-sam-fg">{hit.displayName}</span>
                      <span className="mt-0.5 block text-sm text-sam-fg-muted">
                        {secondaryLine(hit)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
