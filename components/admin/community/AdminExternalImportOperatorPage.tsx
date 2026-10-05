"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { call, type InboxRow, keyOf, type ManagedSource, type TopicOption } from "./external-import/api";
import { ImportEditorPanel } from "./external-import/ImportEditorPanel";
import { type InboxFilter, ImportInboxPanel } from "./external-import/ImportInboxPanel";
import { ImportRulesPanel } from "./external-import/ImportRulesPanel";
import { ImportSourcesPanel } from "./external-import/ImportSourcesPanel";

type Tab = "inbox" | "sources" | "rules";

/**
 * Community import operator console (B+):
 * sources & real boards → inbox (collected, never auto-published) → compare editor → publish / update,
 * plus bulk jobs and replace rules.
 */
export function AdminExternalImportOperatorPage() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [sources, setSources] = useState<ManagedSource[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>({ site: "", board: "", status: "new,draft,source_updated,failed", quality: "", q: "" });
  const [active, setActive] = useState<InboxRow | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const loadSources = useCallback(async () => {
    try {
      setSources((await call<{ sources: ManagedSource[] }>("/sources")).sources);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void loadSources();
    call<{ topics: TopicOption[] }>("/topics")
      .then((r) => setTopics(r.topics))
      .catch(() => setTopics([]));
  }, [loadSources]);

  const bump = () => setRefreshToken((n) => n + 1);

  return (
    <div className="flex flex-col gap-3 min-h-0 h-[calc(100dvh-6.5rem)] max-w-[100vw] overflow-x-hidden">
      <div className="shrink-0">
        <AdminPageHeader
          title="커뮤니티 외부 글 수집"
          description="사이트 등록 → 실제 게시판 선택 → 수집함 → 원문 비교·편집 → 게시/업데이트. 자동 수집은 수집함까지만 하며 자동 게시하지 않습니다."
        />
      </div>
      <div role="tablist" className="flex shrink-0 gap-1 border-b border-sam-border overflow-x-auto">
        {(
          [
            ["inbox", "수집함"],
            ["sources", "출처·게시판"],
            ["rules", "일괄 변경 규칙"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`shrink-0 px-4 py-2.5 text-sm -mb-px border-b-2 ${
              tab === k ? "border-sam-primary text-sam-fg font-semibold" : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {loadError ? <p className="text-xs text-rose-600 break-words shrink-0">출처를 불러오지 못했습니다: {loadError}</p> : null}

      {tab === "inbox" ? (
        <div className="grid flex-1 min-h-0 gap-3 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <div className={`rounded-ui-rect border border-sam-border bg-sam-surface min-h-0 flex flex-col overflow-hidden ${active ? "hidden xl:flex" : "flex"}`}>
            <ImportInboxPanel
              sources={sources}
              topics={topics}
              filter={filter}
              setFilter={setFilter}
              activeKey={active ? keyOf(active) : null}
              onOpen={setActive}
              refreshToken={refreshToken}
              onJobDone={() => void loadSources()}
            />
          </div>
          <div className={`rounded-ui-rect border border-sam-border bg-sam-surface min-h-0 flex-col overflow-hidden ${active ? "flex" : "hidden xl:flex"}`}>
            {active ? (
              <ImportEditorPanel key={keyOf(active)} row={active} topics={topics} onClose={() => setActive(null)} onChanged={bump} />
            ) : (
              <div className="p-6 text-sm text-sam-muted">
                왼쪽 수집함에서 글 제목을 누르면 원문과 게시 결과를 나란히 비교하며 편집할 수 있습니다. 체크박스는 일괄 작업용 선택입니다.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "sources" ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <ImportSourcesPanel
            sources={sources}
            topics={topics}
            onChanged={() => void loadSources()}
            onOpenBoard={(site, board) => {
              setFilter({ ...filter, site, board, status: "" });
              setActive(null);
              setTab("inbox");
              bump();
            }}
          />
        </div>
      ) : null}

      {tab === "rules" ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <ImportRulesPanel sources={sources} />
        </div>
      ) : null}
    </div>
  );
}
