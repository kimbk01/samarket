"use client";

export function PopularSearchList({
  keywords,
  onPick,
}: {
  keywords: string[];
  onPick: (keyword: string) => void;
}) {
  if (!keywords || keywords.length === 0) {
    return (
      <section>
        <h2 className="sam-text-body-secondary font-semibold text-sam-fg">인기 검색어</h2>
        <p className="mt-2 sam-text-body text-sam-muted">표시할 데이터가 없습니다.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="sam-text-body-secondary font-semibold text-sam-fg">인기 검색어</h2>
      <ol className="mt-2 space-y-1.5">
        {keywords.slice(0, 10).map((k, idx) => (
          <li key={`${k}:${idx}`}>
            <button
              type="button"
              onClick={() => onPick(k)}
              className="flex w-full items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-left hover:bg-sam-surface-muted"
            >
              <span className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center sam-text-helper font-bold text-sam-muted">{idx + 1}</span>
                <span className="sam-text-body-secondary font-semibold text-sam-fg">{k}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

