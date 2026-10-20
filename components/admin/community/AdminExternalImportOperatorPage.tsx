"use client";

import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useCommunityQueryState } from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { call, type InboxRow, keyOf, type ManagedSource, type TopicOption, importErrorText } from "./external-import/api";
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
const DEFAULT_STATUS = "new,draft,source_updated,failed";
const DEFAULT_LANG = "ko";
const TABS: Tab[] = ["inbox", "sources", "rules"];

/** URL 값 ↔ 필터 — 비어 있으면 기본값, "all" 은 「전체」 */
function fromUrl(v: string, fallback: string): string {
  if (!v) return fallback;
  return v === "all" ? "" : v;
}
function toUrl(v: string, fallback: string): string | null {
  if (v === fallback) return null;
  return v === "" ? "all" : v;
}

export function AdminExternalImportOperatorPage() {
  return (
    <Suspense fallback={null}>
      <ExternalImportOperatorInner />
    </Suspense>
  );
}

function ExternalImportOperatorInner() {
  // 탭·수집함 필터는 URL 에 둔다 (새로고침·복귀 시 유지)
  const { get, set } = useCommunityQueryState();
  const tabRaw = get("tab") as Tab;
  const tab: Tab = TABS.includes(tabRaw) ? tabRaw : "inbox";
  const setTab = (t: Tab) => set({ tab: t === "inbox" ? null : t });
  const site = get("site");
  const board = get("board");
  const status = fromUrl(get("status"), DEFAULT_STATUS);
  const quality = get("quality");
  const lang = fromUrl(get("lang"), DEFAULT_LANG);
  const q = get("q");
  // 수집함은 filter 객체가 바뀔 때만 다시 불러온다 — 값이 같으면 같은 객체 유지
  const filter: InboxFilter = useMemo(
    () => ({ site, board, status, quality, lang, q }),
    [site, board, status, quality, lang, q]
  );
  const setFilter = (f: InboxFilter, extra: Record<string, string | null> = {}) =>
    set({
      site: f.site,
      board: f.board,
      status: toUrl(f.status, DEFAULT_STATUS),
      quality: f.quality,
      lang: toUrl(f.lang, DEFAULT_LANG),
      q: f.q,
      ...extra,
    });
  const [sources, setSources] = useState<ManagedSource[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<InboxRow | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const loadSources = useCallback(async () => {
    try {
      setSources((await call<{ sources: ManagedSource[] }>("/sources")).sources);
      setLoadError(null);
    } catch (e) {
      setLoadError(importErrorText(e));
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
      <AdminTabs
        className="shrink-0"
        ariaLabel="외부 글 수집 화면"
        tabs={[
          { id: "inbox", label: "수집함" },
          { id: "sources", label: "출처·게시판" },
          { id: "rules", label: "일괄 변경 규칙" },
        ]}
        value={tab}
        syncUrl={false}
        onChange={(id) => setTab(id as Tab)}
      />
      {loadError ? <p role="alert" className="text-xs text-sam-danger break-words shrink-0">출처를 불러오지 못했습니다: {loadError}</p> : null}

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
              setFilter({ ...filter, site, board, status: "" }, { tab: null });
              setActive(null);
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
