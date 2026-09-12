"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  COMMUNITY_CRAWL_CORE_UNAVAILABLE_REASON,
  COMMUNITY_CRAWL_INTERVAL_MINUTES,
  type CommunityCrawlAuthorPolicy,
  type CommunityCrawlBoardRow,
  type CommunityCrawlDatePolicy,
  type CommunityCrawlRunRow,
  type CommunityCrawlSourceRow,
  type CommunityCrawlUpdatePolicy,
  type CommunityCrawlViewPolicy,
} from "@/lib/community-crawler/crawl-ssot";
import type { TestCrawlResult } from "@/lib/community-crawler/core/preview-types";
import { AdminCommunityCrawlItemsPanel } from "@/components/admin/community/AdminCommunityCrawlItemsPanel";
import { AdminCommunityCrawlReplacementRulesPanel } from "@/components/admin/community/AdminCommunityCrawlReplacementRulesPanel";
import type { CommunityCrawlItemOpsDto } from "@/lib/community-crawler/admin-item-ops-dto";
import type { CommunityCrawlMediaPolicy } from "@/lib/community-crawler/crawl-ssot";
import type { AuthorPoolWithAliases, CommunityAuthorPoolAlias } from "@/lib/community-crawler/author-pool-store";
import type { BoardDiagnosticResult } from "@/lib/community-crawler/core/board-diagnostic";

type TopicOpt = { id: string; name: string; slug: string };

type OverviewOk = {
  ok: true;
  sources: CommunityCrawlSourceRow[];
  boards: CommunityCrawlBoardRow[];
  runs: CommunityCrawlRunRow[];
  topics: TopicOpt[];
  authorPools?: AuthorPoolWithAliases[];
  summary: {
    activeBoards: number;
    errorBoards: number;
    lastCrawlAt: string | null;
    totalSources: number;
    totalBoards: number;
  };
  crawlCoreAvailable: boolean;
  crawlCoreUnavailableReason: typeof COMMUNITY_CRAWL_CORE_UNAVAILABLE_REASON;
  testCrawlAvailable?: boolean;
  manualCrawlAvailable?: boolean;
};

const INTERVAL_LABEL_KEYS: Record<number, MessageKey> = {
  30: "admin_community_crawl_interval_30m",
  60: "admin_community_crawl_interval_1h",
  180: "admin_community_crawl_interval_3h",
  360: "admin_community_crawl_interval_6h",
  720: "admin_community_crawl_interval_12h",
  1440: "admin_community_crawl_interval_24h",
};

function intervalLabel(minutes: number | null, t: (k: MessageKey) => string): string {
  if (minutes == null) return "—";
  const key = INTERVAL_LABEL_KEYS[minutes];
  return key ? t(key) : `${minutes}m`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

function crawlRunKindLabel(kind: string, t: (k: MessageKey) => string): string {
  switch (kind) {
    case "MANUAL":
      return t("admin_community_crawl_run_kind_manual");
    case "SCHEDULED":
      return t("admin_community_crawl_run_kind_scheduled");
    case "TEST":
      return t("admin_community_crawl_run_kind_test");
    default:
      return t("admin_community_crawl_run_kind_other");
  }
}

function crawlRunStatusLabel(status: string, t: (k: MessageKey) => string): string {
  switch (status) {
    case "SUCCESS":
      return t("admin_community_crawl_run_status_success");
    case "PARTIAL":
      return t("admin_community_crawl_run_status_partial");
    case "FAILED":
      return t("admin_community_crawl_run_status_failed");
    case "RUNNING":
      return t("admin_community_crawl_run_status_running");
    default:
      return t("admin_community_crawl_run_status_other");
  }
}

function crawlRunCountsLabel(
  r: {
    fetched_count?: number | null;
    inserted_count?: number | null;
    updated_count?: number | null;
    duplicate_count?: number | null;
    skipped_invalid_count?: number | null;
    failed_count?: number | null;
    published_count?: number | null;
    already_published_count?: number | null;
    publish_skipped?: number | null;
  },
  t: (k: MessageKey) => string
): string {
  const parts = [
    `${t("admin_community_crawl_run_fetched_count")} ${r.fetched_count ?? 0}`,
    `${t("admin_community_crawl_run_inserted_count")} ${r.inserted_count ?? 0}`,
    `${t("admin_community_crawl_run_updated_count")} ${r.updated_count ?? 0}`,
    `${t("admin_community_crawl_run_duplicate_count")} ${r.duplicate_count ?? 0}`,
    `${t("admin_community_crawl_run_skipped_invalid_count")} ${r.skipped_invalid_count ?? 0}`,
    `${t("admin_community_crawl_run_failed_count")} ${r.failed_count ?? 0}`,
  ];
  if (r.published_count != null || r.already_published_count != null || r.publish_skipped != null) {
    parts.push(`${t("admin_community_crawl_run_published_count")} ${r.published_count ?? 0}`);
    parts.push(`${t("admin_community_crawl_run_publish_upsert_count")} ${r.already_published_count ?? 0}`);
    parts.push(`${t("admin_community_crawl_run_publish_skipped_count")} ${r.publish_skipped ?? 0}`);
  }
  return parts.join(" · ");
}

function mediaPolicyLabel(p: CommunityCrawlMediaPolicy | string, t: (k: MessageKey) => string): string {
  if (p === "MEDIA_ALLOWED") return t("admin_community_crawl_media_policy_allowed");
  if (p === "MEDIA_DISABLED") return t("admin_community_crawl_media_policy_disabled");
  return t("admin_community_crawl_media_policy_review");
}

function runEventClassLabel(c: string, t: (k: MessageKey) => string): string {
  if (c === "SKIPPED_INVALID") return t("admin_community_crawl_run_event_class_skipped");
  if (c === "FAILED") return t("admin_community_crawl_run_event_class_failed");
  if (c === "MEDIA_INVALID") return t("admin_community_crawl_run_event_class_media");
  return t("admin_community_crawl_run_event_class_other");
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" role="dialog">
      <div className="w-full max-w-xl rounded-ui-rect border border-sam-border bg-sam-surface shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b border-sam-border px-4 py-3">
          <h2 className="sam-text-section-title font-semibold text-sam-fg">{title}</h2>
          <button type="button" className="sam-text-body text-sam-muted hover:text-sam-fg" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="max-h-[min(80vh,720px)] overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

const fieldClass =
  "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg";
const labelClass = "sam-text-helper text-sam-muted";
const btnPrimary =
  "rounded-ui-rect bg-sam-primary px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50";
const btnGhost =
  "rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg disabled:opacity-50";

export function AdminCommunityExternalSourcesPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<CommunityCrawlSourceRow[]>([]);
  const [boards, setBoards] = useState<CommunityCrawlBoardRow[]>([]);
  const [runs, setRuns] = useState<CommunityCrawlRunRow[]>([]);
  const [topics, setTopics] = useState<TopicOpt[]>([]);
  const [authorPools, setAuthorPools] = useState<AuthorPoolWithAliases[]>([]);
  const [summary, setSummary] = useState<OverviewOk["summary"] | null>(null);
  const [busy, setBusy] = useState(false);

  // Author pool manager modal state
  const [showAuthorPoolModal, setShowAuthorPoolModal] = useState(false);
  const [newPoolName, setNewPoolName] = useState("");
  const [newPoolDesc, setNewPoolDesc] = useState("");
  const [selectedPoolForAliases, setSelectedPoolForAliases] = useState<AuthorPoolWithAliases | null>(null);
  const [newAliasName, setNewAliasName] = useState("");
  const [newAliasAvatar, setNewAliasAvatar] = useState("");

  const [sourceModal, setSourceModal] = useState<"create" | CommunityCrawlSourceRow | null>(null);
  const [boardModal, setBoardModal] = useState<
    | { mode: "create"; sourceId: string }
    | { mode: "edit"; board: CommunityCrawlBoardRow }
    | null
  >(null);
  const [manageBoardId, setManageBoardId] = useState<string | null>(null);
  const [itemsBoardId, setItemsBoardId] = useState<string | null>(null);
  const [runEventsOpenId, setRunEventsOpenId] = useState<string | null>(null);
  const [runEvents, setRunEvents] = useState<
    Array<{
      id: string;
      canonical_url: string | null;
      phase: string;
      classification: string;
      error_code: string | null;
      error_message: string | null;
      http_status: number | null;
      created_at: string;
    }>
  >([]);
  const [runEventsLoading, setRunEventsLoading] = useState(false);

  const [srcName, setSrcName] = useState("");
  const [srcUrl, setSrcUrl] = useState("");

  const [boardName, setBoardName] = useState("");
  const [boardUrl, setBoardUrl] = useState("");
  const [topicId, setTopicId] = useState("");
  const [authorPoolId, setAuthorPoolId] = useState<string>("");
  const [publicAttributionMode, setPublicAttributionMode] = useState<"VISIBLE" | "HIDDEN">("VISIBLE");
  const [mediaRequired, setMediaRequired] = useState(true);
  const [dateRecentMinDays, setDateRecentMinDays] = useState(3);
  const [dateRecentMaxDays, setDateRecentMaxDays] = useState(7);
  const [ingestMode, setIngestMode] = useState<"REVIEW_THEN_PUBLISH" | "AUTO_PUBLISH">("REVIEW_THEN_PUBLISH");

  // Diagnostic states
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<BoardDiagnosticResult | null>(null);

  const [updatePolicy, setUpdatePolicy] = useState<CommunityCrawlUpdatePolicy>("CREATE_ONLY");
  const [authorPolicy, setAuthorPolicy] = useState<CommunityCrawlAuthorPolicy>("SOURCE_AUTHOR");
  const [fixedAuthorName, setFixedAuthorName] = useState("");
  const [fixedAuthorAvatar, setFixedAuthorAvatar] = useState("");
  const [randomPoolText, setRandomPoolText] = useState("");
  const [datePolicy, setDatePolicy] = useState<CommunityCrawlDatePolicy>("SOURCE_DATE");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  const [viewPolicy, setViewPolicy] = useState<CommunityCrawlViewPolicy>("SOURCE_VIEW");
  const [viewFixed, setViewFixed] = useState("0");
  const [viewMin, setViewMin] = useState("0");
  const [viewMax, setViewMax] = useState("100");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(60);
  const [maxPages, setMaxPages] = useState("3");
  const [maxPosts, setMaxPosts] = useState("20");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [boardEnabled, setBoardEnabled] = useState(false);
  const [selListItem, setSelListItem] = useState("");
  const [selDetailLink, setSelDetailLink] = useState("");
  const [selTitle, setSelTitle] = useState("");
  const [selContent, setSelContent] = useState("");
  const [selAuthor, setSelAuthor] = useState("");
  const [selDate, setSelDate] = useState("");
  const [selView, setSelView] = useState("");
  const [selImage, setSelImage] = useState("");
  const [selRepImage, setSelRepImage] = useState("");
  const [selSourceId, setSelSourceId] = useState("");
  const [selNextPage, setSelNextPage] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestCrawlResult | null>(null);
  const [testBoardId, setTestBoardId] = useState<string | null>(null);

  const topicNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const tpc of topics) m.set(tpc.id, tpc.name || tpc.slug || tpc.id);
    return m;
  }, [topics]);

  const boardsBySource = useMemo(() => {
    const m = new Map<string, CommunityCrawlBoardRow[]>();
    for (const b of boards) {
      const list = m.get(b.source_id) ?? [];
      list.push(b);
      m.set(b.source_id, list);
    }
    return m;
  }, [boards]);

  const manageBoard = useMemo(
    () => boards.find((b) => b.id === manageBoardId) ?? null,
    [boards, manageBoardId]
  );

  useEffect(() => {
    if (!boards.length) {
      setItemsBoardId(null);
      return;
    }
    if (itemsBoardId && boards.some((b) => b.id === itemsBoardId)) return;
    const preferred =
      boards.find((b) => b.id === "3ff35075-c7af-46bd-805b-a0cf210223cf") ?? boards[0]!;
    setItemsBoardId(preferred.id);
  }, [boards, itemsBoardId]);

  async function openRunEvents(runId: string) {
    setRunEventsOpenId(runId);
    setRunEventsLoading(true);
    setRunEvents([]);
    try {
      const res = await fetch(`/api/admin/community/crawl/runs/${runId}/events`, {
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; events?: typeof runEvents; error?: string };
      if (!j.ok) {
        await dibayAlert({ title: String(j.error ?? "events_load_failed") });
        return;
      }
      setRunEvents(j.events ?? []);
    } finally {
      setRunEventsLoading(false);
    }
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community/crawl/overview", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as OverviewOk | { ok: false; error?: string };
      if (!j.ok) {
        setError(j.error ?? "load_failed");
        setSources([]);
        setBoards([]);
        setRuns([]);
        setSummary(null);
        return;
      }
      setSources(j.sources);
      setBoards(j.boards);
      setRuns(j.runs);
      setTopics(j.topics);
      if (Array.isArray(j.authorPools)) setAuthorPools(j.authorPools);
      setSummary(j.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreateSource() {
    setSrcName("");
    setSrcUrl("");
    setSourceModal("create");
  }

  function openEditSource(s: CommunityCrawlSourceRow) {
    setSrcName(s.name);
    setSrcUrl(s.base_url);
    setSourceModal(s);
  }

  function resetBoardForm(board?: CommunityCrawlBoardRow) {
    setBoardName(board?.name ?? "");
    setBoardUrl(board?.list_url ?? "");
    setTopicId(board?.dibay_topic_id ?? topics[0]?.id ?? "");
    setAuthorPoolId(board?.author_pool_id ?? (authorPools[0]?.id || ""));
    setPublicAttributionMode(board?.public_attribution_mode ?? "VISIBLE");
    setMediaRequired(board?.media_required !== false);
    setDateRecentMinDays(board?.date_recent_min_days ?? 3);
    setDateRecentMaxDays(board?.date_recent_max_days ?? 7);
    setIngestMode(board?.ingest_mode === "AUTO_PUBLISH" ? "AUTO_PUBLISH" : "REVIEW_THEN_PUBLISH");
    setDiagnosticResult(null);
    setUpdatePolicy(board?.update_policy ?? "CREATE_ONLY");
    setAuthorPolicy(board?.author_policy ?? (board?.author_pool_id ? "SOURCE_AUTHOR" : "SOURCE_AUTHOR"));
    const ac = board?.author_config ?? {};
    setFixedAuthorName(typeof ac.fixed_display_name === "string" ? ac.fixed_display_name : "");
    setFixedAuthorAvatar(typeof ac.fixed_avatar_url === "string" ? ac.fixed_avatar_url : "");
    const pool = Array.isArray(ac.random_pool) ? ac.random_pool : [];
    setRandomPoolText(
      pool
        .map((p) => {
          const row = p as { display_name?: string };
          return typeof row.display_name === "string" ? row.display_name : "";
        })
        .filter(Boolean)
        .join("\n")
    );
    setDatePolicy(board?.date_policy ?? "RECENT_RANDOM");
    const dc = board?.date_config ?? {};
    setDateMin(typeof dc.random_min === "string" ? dc.random_min.slice(0, 10) : "");
    setDateMax(typeof dc.random_max === "string" ? dc.random_max.slice(0, 10) : "");
    setViewPolicy(board?.view_policy ?? "RANDOM_RANGE");
    const vc = board?.view_config ?? {};
    setViewFixed(String(typeof vc.fixed === "number" ? vc.fixed : 0));
    setViewMin(String(typeof vc.random_min === "number" ? vc.random_min : 150));
    setViewMax(String(typeof vc.random_max === "number" ? vc.random_max : 450));
    setScheduleEnabled(board?.schedule_enabled === true);
    setIntervalMinutes(board?.crawl_interval_minutes ?? 60);
    setMaxPages(String(board?.max_pages ?? 3));
    setMaxPosts(String(board?.max_posts ?? 20));
    setBoardEnabled(board?.enabled === true);
    setShowAdvanced(false);
    const adapterCfg = board?.adapter_config ?? {};
    const s = (k: string) => (typeof adapterCfg[k] === "string" ? String(adapterCfg[k]) : "");
    setSelListItem(s("listItemSelector") || s("list_item_selector"));
    setSelDetailLink(s("detailLinkSelector") || s("detail_link_selector"));
    setSelTitle(s("titleSelector") || s("title_selector"));
    setSelContent(s("contentSelector") || s("content_selector"));
    setSelAuthor(s("authorSelector") || s("author_selector"));
    setSelDate(s("dateSelector") || s("date_selector"));
    setSelView(s("viewSelector") || s("view_selector"));
    setSelImage(s("imageSelector") || s("image_selector"));
    setSelRepImage(s("representativeImageSelector") || s("representative_image_selector"));
    setSelSourceId(s("sourcePostIdSelector") || s("source_post_id_selector"));
    setSelNextPage(s("nextPageSelector") || s("next_page_selector"));
  }

  async function runDiagnose() {
    const trimmed = boardUrl.trim();
    if (!trimmed) {
      await dibayAlert({ title: "게시판 URL을 먼저 입력해주세요." });
      return;
    }
    setDiagnosing(true);
    setDiagnosticResult(null);
    try {
      const res = await fetch("/api/admin/community/crawl/boards/diagnose", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          list_url: trimmed,
          media_required: mediaRequired,
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        await dibayAlert({ title: String(j.error ?? "게시판 확인 실패") });
        return;
      }
      setDiagnosticResult(j.diagnostic);
      if (!boardName.trim()) {
        try {
          const u = new URL(trimmed);
          setBoardName(`${u.hostname} 게시판`);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      await dibayAlert({ title: `진단 오류: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setDiagnosing(false);
    }
  }

  async function handleCreateAuthorPool() {
    const name = newPoolName.trim();
    if (!name) {
      await dibayAlert({ title: "작성자 풀 이름을 입력해주세요." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/community/crawl/author-pools", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: newPoolDesc.trim() || undefined }),
      });
      const j = await res.json();
      if (!j.ok) {
        await dibayAlert({ title: String(j.error ?? "작성자 풀 생성 실패") });
        return;
      }
      setNewPoolName("");
      setNewPoolDesc("");
      await refresh();
      await dibayAlert({ title: "작성자 풀이 생성되었습니다." });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAlias(poolId: string) {
    const aliasName = newAliasName.trim();
    if (!aliasName) {
      await dibayAlert({ title: "필명을 입력해주세요." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/crawl/author-pools/${poolId}/aliases`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alias_name: aliasName,
          avatar_url: newAliasAvatar.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        const msg =
          j.error === "ALIAS_CONFLICTS_WITH_MEMBER_NICKNAME"
            ? "기존 일반 회원 닉네임과 중복되어 사용할 수 없습니다."
            : String(j.error ?? "필명 등록 실패");
        await dibayAlert({ title: msg });
        return;
      }
      setNewAliasName("");
      setNewAliasAvatar("");
      await refresh();
      await dibayAlert({ title: "필명이 등록되었습니다." });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAlias(poolId: string, aliasId: string) {
    const ok = await dibayConfirm({
      title: "필명 삭제",
      description: "이 필명을 삭제하시겠습니까?",
      confirmLabel: "삭제",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/community/crawl/author-pools/${poolId}/aliases/${aliasId}`, {
        method: "DELETE",
        credentials: "include",
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function buildAdapterConfig(): Record<string, unknown> {
    const out: Record<string, unknown> = {
      detailLinkSelector: selDetailLink.trim(),
      titleSelector: selTitle.trim(),
      contentSelector: selContent.trim(),
    };
    if (selListItem.trim()) out.listItemSelector = selListItem.trim();
    if (selAuthor.trim()) out.authorSelector = selAuthor.trim();
    if (selDate.trim()) out.dateSelector = selDate.trim();
    if (selView.trim()) out.viewSelector = selView.trim();
    if (selImage.trim()) out.imageSelector = selImage.trim();
    if (selRepImage.trim()) out.representativeImageSelector = selRepImage.trim();
    if (selSourceId.trim()) out.sourcePostIdSelector = selSourceId.trim();
    if (selNextPage.trim()) out.nextPageSelector = selNextPage.trim();
    return out;
  }

  function buildAuthorConfig(): Record<string, unknown> {
    if (authorPolicy === "FIXED") {
      return {
        fixed_display_name: fixedAuthorName.trim(),
        fixed_avatar_url: fixedAuthorAvatar.trim() || undefined,
      };
    }
    if (authorPolicy === "RANDOM_POOL") {
      return {
        random_pool: randomPoolText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((display_name) => ({ display_name })),
      };
    }
    return {};
  }

  function buildDateConfig(): Record<string, unknown> {
    if (datePolicy !== "RANDOM_RANGE") return {};
    return {
      random_min: dateMin ? new Date(`${dateMin}T00:00:00.000Z`).toISOString() : undefined,
      random_max: dateMax ? new Date(`${dateMax}T23:59:59.999Z`).toISOString() : undefined,
    };
  }

  function buildViewConfig(): Record<string, unknown> {
    if (viewPolicy === "FIXED") return { fixed: Math.max(0, parseInt(viewFixed, 10) || 0) };
    if (viewPolicy === "RANDOM_RANGE") {
      return {
        random_min: Math.max(0, parseInt(viewMin, 10) || 0),
        random_max: Math.max(0, parseInt(viewMax, 10) || 0),
      };
    }
    return {};
  }

  async function saveSource(andAddBoard: boolean) {
    setBusy(true);
    try {
      if (sourceModal === "create") {
        const res = await fetch("/api/admin/community/crawl/sources", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: srcName, base_url: srcUrl }),
        });
        const j = await res.json();
        if (!j.ok) {
          await dibayAlert({ title: String(j.error ?? "save_failed") });
          return;
        }
        const created = j.source as CommunityCrawlSourceRow;
        setSourceModal(null);
        await refresh();
        if (andAddBoard) {
          resetBoardForm();
          setBoardModal({ mode: "create", sourceId: created.id });
        }
      } else if (sourceModal && typeof sourceModal === "object") {
        const res = await fetch(`/api/admin/community/crawl/sources/${sourceModal.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: srcName, base_url: srcUrl }),
        });
        const j = await res.json();
        if (!j.ok) {
          await dibayAlert({ title: String(j.error ?? "save_failed") });
          return;
        }
        setSourceModal(null);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function pauseSource(s: CommunityCrawlSourceRow) {
    const next = s.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/crawl/sources/${s.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const j = await res.json();
      if (!j.ok) {
        await dibayAlert({ title: String(j.error ?? "save_failed") });
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteSource(s: CommunityCrawlSourceRow) {
    const childCount = (boardsBySource.get(s.id) ?? []).length;
    const ok = await dibayConfirm({
      title: t("admin_community_crawl_delete_source_title"),
      description:
        childCount > 0
          ? t("admin_community_crawl_delete_source_with_boards")
          : t("admin_community_crawl_delete_source_body"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/crawl/sources/${s.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await res.json();
      if (!j.ok) {
        await dibayAlert({ title: String(j.error ?? "delete_failed") });
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveBoard() {
    if (!boardModal) return;
    setBusy(true);
    try {
      const payload = {
        name: boardName,
        list_url: boardUrl,
        dibay_topic_id: topicId,
        adapter_config: buildAdapterConfig(),
        update_policy: updatePolicy,
        author_policy: authorPolicy,
        author_config: buildAuthorConfig(),
        author_pool_id: authorPoolId ? authorPoolId : null,
        public_attribution_mode: publicAttributionMode,
        media_required: mediaRequired,
        date_recent_min_days: dateRecentMinDays,
        date_recent_max_days: dateRecentMaxDays,
        date_policy: datePolicy,
        date_config: buildDateConfig(),
        view_policy: viewPolicy,
        view_config: buildViewConfig(),
        schedule_enabled: scheduleEnabled,
        crawl_interval_minutes: !scheduleEnabled ? null : intervalMinutes,
        max_pages: Math.max(1, parseInt(maxPages, 10) || 3),
        max_posts: Math.max(1, parseInt(maxPosts, 10) || 20),
        enabled: boardEnabled,
        ingest_mode: ingestMode,
      };
      if (boardModal.mode === "create") {
        const res = await fetch("/api/admin/community/crawl/boards", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, source_id: boardModal.sourceId }),
        });
        const j = await res.json();
        if (!j.ok) {
          await dibayAlert({ title: String(j.error ?? "save_failed") });
          return;
        }
      } else {
        const res = await fetch(`/api/admin/community/crawl/boards/${boardModal.board.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await res.json();
        if (!j.ok) {
          await dibayAlert({ title: String(j.error ?? "save_failed") });
          return;
        }
      }
      setBoardModal(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleBoardSchedule(board: CommunityCrawlBoardRow) {
    setBusy(true);
    try {
      const next = !board.schedule_enabled;
      const res = await fetch(`/api/admin/community/crawl/boards/${board.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_enabled: next,
          crawl_interval_minutes: next ? board.crawl_interval_minutes ?? 60 : null,
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        await dibayAlert({ title: String(j.error ?? "save_failed") });
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteBoard(board: CommunityCrawlBoardRow) {
    const ok = await dibayConfirm({
      title: t("admin_community_crawl_delete_board_title"),
      description: t("admin_community_crawl_delete_board_body"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/crawl/boards/${board.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await res.json();
      if (!j.ok) {
        await dibayAlert({ title: String(j.error ?? "delete_failed") });
        return;
      }
      if (manageBoardId === board.id) setManageBoardId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function runRealCrawl(boardId: string) {
    setBusy(true);
    setManageBoardId(null);
    setItemsBoardId(boardId);
    try {
      const res = await fetch(`/api/admin/community/crawl/boards/${boardId}/crawl`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPosts: 15 }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        items?: CommunityCrawlItemOpsDto[];
        result?: {
          status?: CommunityCrawlRunRow["status"];
          runId?: string | null;
          insertedCount?: number;
          updatedCount?: number;
          duplicateCount?: number;
          skippedInvalidCount?: number;
          failedCount?: number;
          fetchedCount?: number;
          publishedCount?: number;
          alreadyPublishedCount?: number;
          publishSkippedPolicy?: number;
          publishSkippedMode?: number;
        };
        error?: string;
      };
      if (!j.ok) {
        await dibayAlert({ title: String(j.error ?? "crawl_failed") });
        return;
      }
      // ACK → LIST: materialize from crawl payload only (no overview refresh GET).
      window.dispatchEvent(new CustomEvent("community-crawl-items-ack", { detail: j.items ?? [] }));
      const result = j.result;
      if (result?.runId) {
        const now = new Date().toISOString();
        const row: CommunityCrawlRunRow = {
          id: result.runId,
          board_id: boardId,
          run_kind: "MANUAL",
          status: result.status ?? "SUCCESS",
          started_at: now,
          finished_at: now,
          fetched_count: result.fetchedCount ?? 0,
          inserted_count: result.insertedCount ?? 0,
          updated_count: result.updatedCount ?? 0,
          duplicate_count: result.duplicateCount ?? 0,
          skipped_invalid_count: result.skippedInvalidCount ?? 0,
          failed_count: result.failedCount ?? 0,
          error_code: null,
          error_message: null,
        };
        setRuns((prev) => [row, ...prev.filter((r) => r.id !== row.id)]);
      }
      await dibayAlert({
        title: [
          crawlRunStatusLabel(result?.status ?? "SUCCESS", t),
          crawlRunCountsLabel(
            {
              fetched_count: result?.fetchedCount ?? 0,
              inserted_count: result?.insertedCount ?? 0,
              updated_count: result?.updatedCount ?? 0,
              duplicate_count: result?.duplicateCount ?? 0,
              skipped_invalid_count: result?.skippedInvalidCount ?? 0,
              failed_count: result?.failedCount ?? 0,
              published_count: result?.publishedCount ?? 0,
              already_published_count: result?.alreadyPublishedCount ?? 0,
              publish_skipped:
                (result?.publishSkippedPolicy ?? 0) + (result?.publishSkippedMode ?? 0),
            },
            t
          ),
        ].join(" · "),
      });
    } catch (e) {
      await dibayAlert({ title: e instanceof Error ? e.message : "crawl_failed" });
    } finally {
      setBusy(false);
    }
  }

  async function runTestCrawl(boardId: string) {
    setTestLoading(true);
    setTestBoardId(boardId);
    setTestResult(null);
    setManageBoardId(null);
    try {
      const res = await fetch(`/api/admin/community/crawl/boards/${boardId}/test`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        result?: TestCrawlResult;
        error?: string;
      };
      if (!j.result) {
        await dibayAlert({ title: String(j.error ?? "test_failed") });
        return;
      }
      setTestResult(j.result);
      await refresh();
    } catch (e) {
      await dibayAlert({ title: e instanceof Error ? e.message : "test_failed" });
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div className="space-y-4 text-sam-fg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader
          titleKey="admin_community_crawl_title"
          descriptionKey="admin_community_crawl_desc"
          backHref="/admin/community"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btnGhost}
            onClick={() => setShowAuthorPoolModal(true)}
            disabled={busy || loading}
          >
            작성자 풀 관리 ({authorPools.length})
          </button>
          <button type="button" className={btnPrimary} onClick={openCreateSource} disabled={busy || loading}>
            {t("admin_community_crawl_add_source")}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("admin_community_crawl_loading")}</p>
      ) : error ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
          <p className="sam-text-body text-sam-fg">{t("admin_community_crawl_registry_missing")}</p>
          <p className="mt-1 sam-text-helper text-sam-muted">{error}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body">
            <div>
              <span className="text-sam-muted">{t("admin_community_crawl_summary_active")} </span>
              <span className="font-semibold tabular-nums">{summary?.activeBoards ?? 0}</span>
            </div>
            <div>
              <span className="text-sam-muted">{t("admin_community_crawl_summary_errors")} </span>
              <span className="font-semibold tabular-nums">{summary?.errorBoards ?? 0}</span>
            </div>
            <div>
              <span className="text-sam-muted">{t("admin_community_crawl_summary_last")} </span>
              <span className="font-semibold">{formatWhen(summary?.lastCrawlAt ?? null)}</span>
            </div>
          </div>

          <section className="space-y-3">
            {sources.length === 0 ? (
              <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-4 py-8 text-center">
                <p className="sam-text-body text-sam-muted">{t("admin_community_crawl_empty_sources")}</p>
              </div>
            ) : (
              sources.map((s) => {
                const children = boardsBySource.get(s.id) ?? [];
                return (
                  <div key={s.id} className="rounded-ui-rect border border-sam-border bg-sam-surface overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sam-border px-4 py-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-sam-fg">{s.name}</div>
                        <div className="sam-text-helper text-sam-muted truncate">{s.base_url}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="sam-text-helper text-sam-muted">
                          {s.status === "ACTIVE"
                            ? t("admin_community_crawl_source_active")
                            : t("admin_community_crawl_source_paused")}
                          {" · "}
                          {t("admin_community_crawl_content_policy_label")}:{" "}
                          {s.policy_status === "REVIEW_REQUIRED"
                            ? t("admin_community_crawl_policy_review")
                            : s.policy_status}
                          {" · "}
                          {t("admin_community_crawl_media_policy_label")}:{" "}
                          {mediaPolicyLabel(s.media_policy, t)}
                        </span>
                        <button type="button" className={btnGhost} disabled={busy} onClick={() => openEditSource(s)}>
                          {t("admin_community_crawl_edit")}
                        </button>
                        <button type="button" className={btnGhost} disabled={busy} onClick={() => void pauseSource(s)}>
                          {s.status === "ACTIVE"
                            ? t("admin_community_crawl_pause")
                            : t("admin_community_crawl_resume")}
                        </button>
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={busy}
                          onClick={() => {
                            resetBoardForm();
                            setBoardModal({ mode: "create", sourceId: s.id });
                          }}
                        >
                          {t("admin_community_crawl_add_board")}
                        </button>
                        <button type="button" className={btnGhost} disabled={busy} onClick={() => void deleteSource(s)}>
                          {t("admin_community_crawl_delete")}
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-sam-border">
                      {children.length === 0 ? (
                        <p className="px-4 py-3 sam-text-body text-sam-muted">
                          {t("admin_community_crawl_empty_boards")}
                        </p>
                      ) : (
                        children.map((b) => (
                          <div
                            key={b.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="font-medium text-sam-fg">{b.name}</div>
                              <div className="sam-text-helper text-sam-muted">
                                {t("admin_community_crawl_to_topic")}:{" "}
                                {topicNameById.get(b.dibay_topic_id) ?? b.dibay_topic_id}
                                {" · "}
                                <span className="font-medium">
                                  {b.ingest_mode === "AUTO_PUBLISH"
                                    ? "자동 게시 (AUTO)"
                                    : b.ingest_mode === "REVIEW_THEN_PUBLISH"
                                      ? "검토 후 게시 (REVIEW)"
                                      : "수집 전용 (COLLECT)"}
                                </span>
                              </div>
                              <div className="sam-text-helper text-sam-muted">
                                {b.schedule_enabled
                                  ? `${t("admin_community_crawl_auto_on")} · ${intervalLabel(b.crawl_interval_minutes, t)}`
                                  : t("admin_community_crawl_auto_off")}
                                {" · "}
                                {b.last_error
                                  ? t("admin_community_crawl_status_error")
                                  : b.last_success_at
                                    ? t("admin_community_crawl_status_ok")
                                    : t("admin_community_crawl_status_idle")}
                                {" · "}
                                {t("admin_community_crawl_last_run")}: {formatWhen(b.last_run_at)}
                              </div>
                            </div>
                            <button
                              type="button"
                              className={btnGhost}
                              onClick={() => {
                                setItemsBoardId(b.id);
                                setManageBoardId(b.id);
                              }}
                            >
                              {t("admin_community_crawl_manage")}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </section>

          <AdminCommunityCrawlItemsPanel
            boardId={itemsBoardId}
            boards={boards}
            onBoardIdChange={(id) => setItemsBoardId(id)}
          />

          <section className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
            <h3 className="sam-text-section-title font-semibold text-sam-fg">
              {t("admin_community_crawl_recent_runs")}
            </h3>
            {runs.length === 0 ? (
              <p className="mt-2 sam-text-body text-sam-muted">{t("admin_community_crawl_runs_empty")}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {runs.slice(0, 15).map((r) => (
                  <li
                    key={r.id}
                    className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg space-y-1 overflow-hidden"
                  >
                    <div className="break-words">
                      <span className="text-sam-muted">{crawlRunKindLabel(r.run_kind, t)}</span>
                      {" · "}
                      {crawlRunStatusLabel(r.status, t)}
                      {" · "}
                      {formatWhen(r.started_at)}
                    </div>
                    <div className="sam-text-helper text-sam-muted break-words">
                      {crawlRunCountsLabel(r, t)}
                    </div>
                    <button type="button" className={btnGhost} onClick={() => void openRunEvents(r.id)}>
                      {t("admin_community_crawl_run_events")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {runEventsOpenId ? (
        <ModalShell
          title={t("admin_community_crawl_run_events")}
          onClose={() => {
            setRunEventsOpenId(null);
            setRunEvents([]);
          }}
        >
          {runEventsLoading ? (
            <p className="sam-text-body text-sam-muted">{t("admin_community_crawl_loading")}</p>
          ) : runEvents.length === 0 ? (
            <p className="sam-text-body text-sam-muted">{t("admin_community_crawl_run_events_empty")}</p>
          ) : (
            <ul className="space-y-2">
              {runEvents.map((ev) => (
                <li
                  key={ev.id}
                  className={`rounded-ui-rect border px-3 py-2 sam-text-helper break-words ${
                    ev.classification === "FAILED"
                      ? "border-red-300 bg-red-50 text-sam-fg"
                      : ev.classification === "SKIPPED_INVALID"
                        ? "border-amber-300 bg-amber-50 text-sam-fg"
                        : "border-sam-border bg-sam-app text-sam-fg"
                  }`}
                >
                  <div className="font-medium">
                    {runEventClassLabel(ev.classification, t)} · {ev.phase}
                    {ev.http_status != null ? ` · HTTP ${ev.http_status}` : ""}
                  </div>
                  <div className="text-sam-muted">{formatWhen(ev.created_at)}</div>
                  <div className="break-all">{ev.canonical_url || "—"}</div>
                  <div>
                    {ev.error_code || "—"}
                    {ev.error_message ? ` · ${ev.error_message}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ModalShell>
      ) : null}

      {manageBoard ? (
        <ModalShell title={t("admin_community_crawl_manage_title")} onClose={() => setManageBoardId(null)}>
          <div className="space-y-3">
            <p className="sam-text-body text-sam-fg font-medium">{manageBoard.name}</p>
            <p className="sam-text-helper text-sam-muted">{manageBoard.list_url}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  resetBoardForm(manageBoard);
                  setBoardModal({ mode: "edit", board: manageBoard });
                  setManageBoardId(null);
                }}
              >
                {t("admin_community_crawl_edit_settings")}
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={busy || testLoading}
                onClick={() => void runRealCrawl(manageBoard.id)}
              >
                {busy ? t("admin_community_crawl_run_running") : t("admin_community_crawl_run_now")}
              </button>
              <button
                type="button"
                className={btnGhost}
                disabled={busy || testLoading}
                onClick={() => void runTestCrawl(manageBoard.id)}
              >
                {testLoading ? t("admin_community_crawl_test_running") : t("admin_community_crawl_test")}
              </button>
              <button
                type="button"
                className={btnGhost}
                disabled={busy}
                onClick={() => void toggleBoardSchedule(manageBoard)}
              >
                {manageBoard.schedule_enabled
                  ? t("admin_community_crawl_auto_turn_off")
                  : t("admin_community_crawl_auto_turn_on")}
              </button>
              <button
                type="button"
                className={btnGhost}
                disabled={busy}
                onClick={() => void deleteBoard(manageBoard)}
              >
                {t("admin_community_crawl_delete")}
              </button>
            </div>
            <p className="sam-text-helper text-sam-muted">{t("admin_community_crawl_test_preview_only_hint")}</p>
            <AdminCommunityCrawlReplacementRulesPanel
              sourceId={manageBoard.source_id}
              boardId={manageBoard.id}
            />
          </div>
        </ModalShell>
      ) : null}

      {testLoading ? (
        <ModalShell title={t("admin_community_crawl_preview_title")} onClose={() => {}}>
          <p className="sam-text-body text-sam-muted">{t("admin_community_crawl_test_running")}</p>
        </ModalShell>
      ) : null}

      {testResult && !testLoading ? (
        <ModalShell
          title={t("admin_community_crawl_preview_title")}
          onClose={() => {
            setTestResult(null);
            setTestBoardId(null);
          }}
        >
          <div className="space-y-4">
            {(() => {
              const b = boards.find((x) => x.id === testBoardId);
              const s = b ? sources.find((x) => x.id === b.source_id) : null;
              const hasPreviews = testResult.previews.length > 0;
              const isAllowed = s?.policy_status === "ALLOWED" && s?.media_policy === "MEDIA_ALLOWED";

              let badge = {
                title: "소스 오류 (SOURCE INVALID)",
                desc: "기사 목록 또는 본문 상세를 가져올 수 없습니다. URL 및 파서를 확인하세요.",
                cls: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
              };
              if (hasPreviews && isAllowed) {
                badge = {
                  title: "자동 수집 준비 완료 (READY FOR AUTO)",
                  desc: "제목, 본문, 이미지 추출 및 발행 권한이 모두 확인되어 자동 수집 및 게시가 가능합니다.",
                  cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                };
              } else if (hasPreviews) {
                badge = {
                  title: "수동 검토 대상 (REVIEW ONLY)",
                  desc: "기사 추출은 가능하지만 소스 또는 미디어 정책이 승인(ALLOWED)되지 않아 자동 게시되지 않고 검토 대기 처리됩니다.",
                  cls: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                };
              }

              return (
                <div className={`rounded-ui-rect border p-3 ${badge.cls}`}>
                  <div className="font-semibold">{badge.title}</div>
                  <div className="sam-text-helper mt-1">{badge.desc}</div>
                </div>
              );
            })()}
            <p className="sam-text-body text-sam-fg">
              {t("admin_community_crawl_preview_status")}: <strong>{testResult.status}</strong>
              {" · "}
              {testResult.successCount}/{testResult.successCount + testResult.failedCount}
              {(testResult.skippedInvalidCount ?? 0) > 0
                ? ` · ${t("admin_community_crawl_run_skipped_invalid_count")} ${testResult.skippedInvalidCount}`
                : null}
            </p>
            <p className="sam-text-helper text-sam-muted">
              {t("admin_community_crawl_preview_external_only")} · policy={testResult.policyStatus}
            </p>
            <p className="sam-text-helper text-sam-muted">{t("admin_community_crawl_preview_no_register")}</p>
            {testResult.previews.map((p) => (
              <article
                key={p.sourceUrl}
                className="rounded-ui-rect border border-sam-border bg-sam-app p-3 space-y-2 overflow-hidden"
              >
                <div className="font-semibold text-sam-fg break-words">{p.title}</div>
                {p.representativeImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin preview external URL only
                  <img
                    src={p.representativeImageUrl}
                    alt=""
                    className="max-h-40 w-auto max-w-full rounded-ui-rect object-contain bg-sam-surface"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <p className="sam-text-helper text-sam-muted">{t("admin_community_crawl_preview_rep_none")}</p>
                )}
                <p className="sam-text-body text-sam-fg whitespace-pre-wrap break-words">{p.contentPreview}</p>
                <div className="sam-text-helper text-sam-muted space-y-1">
                  <div>
                    {t("admin_community_crawl_preview_author")}:{" "}
                    {p.authorDisplayName || t("admin_community_crawl_preview_author_missing")}
                  </div>
                  <div>
                    {t("admin_community_crawl_preview_date")}:{" "}
                    {p.displayDateIso
                      ? formatWhen(p.displayDateIso)
                      : t("admin_community_crawl_preview_date_missing")}
                  </div>
                  <div>
                    {t("admin_community_crawl_preview_views")}:{" "}
                    {p.viewCount != null
                      ? String(p.viewCount)
                      : t("admin_community_crawl_preview_views_missing")}
                  </div>
                  <div>
                    {t("admin_community_crawl_preview_category")}: {p.dibayTopicName ?? p.dibayTopicId}
                  </div>
                  <div>
                    {t("admin_community_crawl_preview_images")}:{" "}
                    {p.bodyImageCount > 0
                      ? String(p.bodyImageCount)
                      : t("admin_community_crawl_preview_body_images_none")}
                  </div>
                  <a
                    href={p.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sam-primary break-all"
                  >
                    {t("admin_community_crawl_preview_source_url")}: {p.sourceUrl}
                  </a>
                </div>
              </article>
            ))}
            {testResult.failures.length > 0 ? (
              <div className="space-y-2">
                <h4 className="font-medium text-sam-fg">{t("admin_community_crawl_preview_failures")}</h4>
                {testResult.failures.map((f, i) => (
                  <p key={`${f.sourceUrl ?? "x"}-${i}`} className="sam-text-helper text-sam-danger break-words">
                    {f.errorCode}: {f.errorMessage}
                    {f.sourceUrl ? ` · ${f.sourceUrl}` : ""}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={!testBoardId || busy}
                onClick={() => testBoardId && void runTestCrawl(testBoardId)}
              >
                {t("admin_community_crawl_test_again")}
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  const board = boards.find((b) => b.id === testBoardId);
                  if (board) {
                    resetBoardForm(board);
                    setBoardModal({ mode: "edit", board });
                  }
                  setTestResult(null);
                }}
              >
                {t("admin_community_crawl_edit_settings")}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {sourceModal ? (
        <ModalShell
          title={
            sourceModal === "create"
              ? t("admin_community_crawl_add_source")
              : t("admin_community_crawl_edit_source")
          }
          onClose={() => setSourceModal(null)}
        >
          <div className="space-y-3">
            <label className="block">
              <span className={labelClass}>{t("admin_community_crawl_site_name")}</span>
              <input className={fieldClass} value={srcName} onChange={(e) => setSrcName(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelClass}>{t("admin_community_crawl_site_url")}</span>
              <input className={fieldClass} value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} />
            </label>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button type="button" className={btnGhost} onClick={() => setSourceModal(null)}>
                {t("admin_community_crawl_cancel")}
              </button>
              {sourceModal === "create" ? (
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy || !srcName.trim() || !srcUrl.trim()}
                  onClick={() => void saveSource(true)}
                >
                  {t("admin_community_crawl_save_then_board")}
                </button>
              ) : (
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy || !srcName.trim() || !srcUrl.trim()}
                  onClick={() => void saveSource(false)}
                >
                  {t("admin_community_crawl_save")}
                </button>
              )}
            </div>
          </div>
        </ModalShell>
      ) : null}

      {boardModal ? (
        <ModalShell
          title={
            boardModal.mode === "create"
              ? "게시판 추가 (DIBAY 수집)"
              : "게시판 설정 수정"
          }
          onClose={() => setBoardModal(null)}
        >
          <div className="space-y-4 max-h-[min(80vh,760px)] overflow-y-auto pr-1">
            {/* Step 1: URL & Diagnostic */}
            <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3 space-y-2">
              <label className="block">
                <span className="sam-text-helper font-medium text-sam-fg">1. 게시판 주소 입력</span>
                <div className="mt-1 flex gap-2">
                  <input
                    className={fieldClass}
                    placeholder="https://example.com/community/board"
                    value={boardUrl}
                    onChange={(e) => setBoardUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-ui-rect bg-sam-primary px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50"
                    disabled={diagnosing || !boardUrl.trim()}
                    onClick={() => void runDiagnose()}
                  >
                    {diagnosing ? "분석 중…" : "게시판 확인"}
                  </button>
                </div>
              </label>

              {/* Diagnostic Result */}
              {diagnosticResult ? (
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        diagnosticResult.status === "READY"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : diagnosticResult.status === "PARTIAL"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                            : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                      }`}
                    >
                      {diagnosticResult.status === "READY"
                        ? "수집 준비 완료 (READY)"
                        : diagnosticResult.status === "PARTIAL"
                          ? "부분 수집 가능 (PARTIAL: 이미지 없음)"
                          : diagnosticResult.status === "UNSUPPORTED_JS"
                            ? "JS 렌더링 미지원 (UNSUPPORTED_JS)"
                            : "수집 불가 (UNSUPPORTED)"}
                    </span>
                    <span className="sam-text-helper text-sam-muted">
                      감지된 게시글 {diagnosticResult.detectedArticlesCount}건
                    </span>
                  </div>
                  <p className="sam-text-helper text-sam-fg">{diagnosticResult.reason}</p>

                  {diagnosticResult.sampleArticles.length > 0 ? (
                    <div className="space-y-1 pt-1">
                      <span className="sam-text-helper text-sam-muted font-medium">추출 샘플 미리보기:</span>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {diagnosticResult.sampleArticles.map((sample, idx) => (
                          <div key={idx} className="rounded-ui-rect border border-sam-border bg-sam-app p-2 space-y-1 overflow-hidden">
                            {sample.coverUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={sample.coverUrl} alt="" className="h-20 w-full rounded-ui-rect object-cover bg-sam-surface" />
                            ) : (
                              <div className="flex h-20 w-full items-center justify-center rounded-ui-rect bg-sam-surface text-xs text-sam-muted">
                                대표 이미지 없음
                              </div>
                            )}
                            <div className="font-semibold text-xs text-sam-fg truncate">{sample.title}</div>
                            <div className="text-[11px] text-sam-muted line-clamp-2">{sample.snippet}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Step 2: DIBAY Settings */}
            <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3 space-y-3">
              <span className="sam-text-helper font-medium text-sam-fg">2. DIBAY 정책 및 게시판 설정</span>

              <label className="block">
                <span className={labelClass}>게시판 관리 이름</span>
                <input className={fieldClass} value={boardName} onChange={(e) => setBoardName(e.target.value)} />
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>DIBAY 게시판 (카테고리)</span>
                  <select className={fieldClass} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                    {topics.map((tp) => (
                      <option key={tp.id} value={tp.id}>
                        {tp.name || tp.slug}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={labelClass}>작성자 풀 (Author Pool)</span>
                  <select
                    className={fieldClass}
                    value={authorPoolId}
                    onChange={(e) => setAuthorPoolId(e.target.value)}
                  >
                    <option value="">풀 미지정 (기본 에디터 사용)</option>
                    {authorPools.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.aliases.filter((a: CommunityAuthorPoolAlias) => a.is_active).length}명)
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>작성일 정책</span>
                  <select
                    className={fieldClass}
                    value={datePolicy}
                    onChange={(e) => setDatePolicy(e.target.value as CommunityCrawlDatePolicy)}
                  >
                    <option value="RECENT_RANDOM">최근 기간 내 랜덤 (추천)</option>
                    <option value="SOURCE_DATE">원문 작성일</option>
                    <option value="IMPORT_DATE">수집 시점</option>
                  </select>
                </label>

                {datePolicy === "RECENT_RANDOM" ? (
                  <div className="flex items-center gap-2 pt-5">
                    <span className="text-xs text-sam-muted">최근</span>
                    <input
                      type="number"
                      className="w-16 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm text-sam-fg"
                      value={dateRecentMinDays}
                      onChange={(e) => setDateRecentMinDays(Number(e.target.value))}
                    />
                    <span className="text-xs text-sam-muted">일 ~</span>
                    <input
                      type="number"
                      className="w-16 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm text-sam-fg"
                      value={dateRecentMaxDays}
                      onChange={(e) => setDateRecentMaxDays(Number(e.target.value))}
                    />
                    <span className="text-xs text-sam-muted">일 전</span>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>초기 조회수 범위 (시드)</span>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      className="w-24 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm text-sam-fg"
                      value={viewMin}
                      onChange={(e) => setViewMin(e.target.value)}
                    />
                    <span className="text-xs text-sam-muted">~</span>
                    <input
                      type="number"
                      className="w-24 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm text-sam-fg"
                      value={viewMax}
                      onChange={(e) => setViewMax(e.target.value)}
                    />
                  </div>
                </label>

                <label className="block">
                  <span className={labelClass}>출처 공개 여부</span>
                  <select
                    className={fieldClass}
                    value={publicAttributionMode}
                    onChange={(e) => setPublicAttributionMode(e.target.value as "VISIBLE" | "HIDDEN")}
                  >
                    <option value="VISIBLE">원문 출처 링크 공개</option>
                    <option value="HIDDEN">출처 비공개 (내부 감사 보존)</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 sam-text-body">
                  <input
                    type="checkbox"
                    checked={mediaRequired}
                    onChange={(e) => setMediaRequired(e.target.checked)}
                  />
                  <span className="text-sm">대표 이미지 필수 (이미지 없는 글 수집 제외)</span>
                </label>

                <label className="flex items-center gap-2 sam-text-body">
                  <input
                    type="checkbox"
                    checked={boardEnabled}
                    onChange={(e) => setBoardEnabled(e.target.checked)}
                  />
                  <span className="text-sm">게시판 활성화</span>
                </label>
              </div>

              <div className="border-t border-sam-border pt-2 space-y-2">
                <span className={labelClass}>운영 방식</span>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="ingest_mode"
                      checked={ingestMode === "REVIEW_THEN_PUBLISH"}
                      onChange={() => {
                        setIngestMode("REVIEW_THEN_PUBLISH");
                        setScheduleEnabled(false);
                      }}
                    />
                    <span className="text-sm">수동 운영 (MANUAL: 불러온 글 선택 검토 후 [DIBAY 적용])</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="ingest_mode"
                      checked={ingestMode === "AUTO_PUBLISH"}
                      onChange={() => {
                        setIngestMode("AUTO_PUBLISH");
                        setScheduleEnabled(true);
                      }}
                    />
                    <span className="text-sm">자동 운영 (AUTO: {t("admin_community_crawl_auto_collect")} 및 발행)</span>
                  </label>
                </div>

                {ingestMode === "AUTO_PUBLISH" ? (
                  <div className="flex items-center gap-2 pl-6 pt-1">
                    <span className="text-xs text-sam-muted">수집 주기:</span>
                    <select
                      className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm text-sam-fg"
                      value={intervalMinutes}
                      onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                    >
                      {COMMUNITY_CRAWL_INTERVAL_MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {intervalLabel(m, t)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Optional Advanced Selectors */}
            <button
              type="button"
              className="sam-text-helper text-sam-muted hover:text-sam-fg underline"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced
                ? "고급 선택자 접기"
                : "고급 선택자 직접 지정 (선택사항, 비워두면 자동 시맨틱 추출)"}
            </button>
            {showAdvanced ? (
              <fieldset className="space-y-2 rounded-ui-rect border border-sam-border p-3">
                <legend className={labelClass}>CSS 선택자 수동 오버라이드 (기본 불필요)</legend>
                <p className="sam-text-helper text-sam-muted">
                  기본 상태에서는 AI 시맨틱 추출기가 본문/제목/이미지를 자동 추출합니다. 특정 레이아웃 강제 시에만 입력하세요.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>상세 링크 선택자</span>
                    <input className={fieldClass} value={selDetailLink} onChange={(e) => setSelDetailLink(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>제목 선택자</span>
                    <input className={fieldClass} value={selTitle} onChange={(e) => setSelTitle(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>본문 선택자</span>
                    <input className={fieldClass} value={selContent} onChange={(e) => setSelContent(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>대표 이미지 선택자</span>
                    <input className={fieldClass} value={selRepImage} onChange={(e) => setSelRepImage(e.target.value)} />
                  </label>
                </div>
              </fieldset>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-sam-border">
              <button type="button" className={btnGhost} onClick={() => setBoardModal(null)}>
                {t("admin_community_crawl_cancel")}
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={busy || !boardName.trim() || !boardUrl.trim() || !topicId}
                onClick={() => void saveBoard()}
              >
                {t("admin_community_crawl_save")}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {/* Author Pool SSOT Management Modal */}
      {showAuthorPoolModal ? (
        <ModalShell
          title="작성자 풀 관리 (Author Pool SSOT)"
          onClose={() => {
            setShowAuthorPoolModal(false);
            setSelectedPoolForAliases(null);
          }}
        >
          <div className="space-y-4 max-h-[min(80vh,720px)] overflow-y-auto">
            <p className="sam-text-helper text-sam-muted">
              회원 계정과 독립된 편집용 필명 풀입니다. 일반 회원 닉네임과 중복되지 않도록 보호됩니다.
            </p>

            {/* Create pool */}
            <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3 space-y-2">
              <span className="sam-text-helper font-medium text-sam-fg">+ 새 작성자 풀 생성</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className={fieldClass}
                  placeholder="풀 이름 (예: 필리핀 여행 에디터)"
                  value={newPoolName}
                  onChange={(e) => setNewPoolName(e.target.value)}
                />
                <input
                  className={fieldClass}
                  placeholder="설명 (선택)"
                  value={newPoolDesc}
                  onChange={(e) => setNewPoolDesc(e.target.value)}
                />
              </div>
              <button
                type="button"
                className={btnPrimary}
                disabled={busy || !newPoolName.trim()}
                onClick={() => void handleCreateAuthorPool()}
              >
                풀 생성
              </button>
            </div>

            {/* List of pools */}
            <div className="space-y-3">
              {authorPools.length === 0 ? (
                <p className="text-sm text-sam-muted text-center py-4">등록된 작성자 풀이 없습니다.</p>
              ) : (
                authorPools.map((pool) => (
                  <div key={pool.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sam-fg">{pool.name}</span>
                        {pool.description ? (
                          <span className="sam-text-helper text-sam-muted ml-2">({pool.description})</span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className={btnGhost}
                        onClick={() => setSelectedPoolForAliases(selectedPoolForAliases?.id === pool.id ? null : pool)}
                      >
                        {selectedPoolForAliases?.id === pool.id ? "접기" : `필명 관리 (${pool.aliases.length}명)`}
                      </button>
                    </div>

                    {selectedPoolForAliases?.id === pool.id ? (
                      <div className="border-t border-sam-border pt-2 space-y-2">
                        <div className="flex gap-2">
                          <input
                            className={fieldClass}
                            placeholder="새 필명 (예: 마닐라탐험가)"
                            value={newAliasName}
                            onChange={(e) => setNewAliasName(e.target.value)}
                          />
                          <input
                            className={fieldClass}
                            placeholder="아바타 URL (선택)"
                            value={newAliasAvatar}
                            onChange={(e) => setNewAliasAvatar(e.target.value)}
                          />
                          <button
                            type="button"
                            className="shrink-0 rounded-ui-rect bg-sam-primary px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50"
                            disabled={busy || !newAliasName.trim()}
                            onClick={() => void handleAddAlias(pool.id)}
                          >
                            추가
                          </button>
                        </div>

                        <ul className="divide-y divide-sam-border">
                          {pool.aliases.length === 0 ? (
                            <li className="py-2 text-xs text-sam-muted text-center">등록된 필명이 없습니다.</li>
                          ) : (
                            pool.aliases.map((al: CommunityAuthorPoolAlias) => (
                              <li key={al.id} className="flex items-center justify-between py-1.5">
                                <div className="flex items-center gap-2">
                                  {al.avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={al.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                                  ) : (
                                    <div className="h-6 w-6 rounded-full bg-sam-primary/20 text-sam-primary flex items-center justify-center text-xs font-bold">
                                      {al.alias_name.slice(0, 1)}
                                    </div>
                                  )}
                                  <span className="text-sm font-medium text-sam-fg">{al.alias_name}</span>
                                </div>
                                <button
                                  type="button"
                                  className="text-xs text-rose-400 hover:text-rose-300"
                                  onClick={() => void handleDeleteAlias(pool.id, al.id)}
                                >
                                  삭제
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
