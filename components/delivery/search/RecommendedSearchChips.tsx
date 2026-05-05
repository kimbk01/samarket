"use client";

export function RecommendedSearchChips({
  keywords,
  onPick,
}: {
  keywords: string[];
  onPick: (keyword: string) => void;
}) {
  return (
    <section>
      <h2 className="sam-text-body-secondary font-semibold text-sam-fg">추천 검색어</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {keywords.map((k) => (
          <li key={k}>
            <button
              type="button"
              onClick={() => onPick(k)}
              className="rounded-full border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-surface-muted"
            >
              {k}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

