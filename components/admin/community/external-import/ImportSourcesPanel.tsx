"use client";

import { useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { DetectResult } from "@/lib/community-operator-import/detect";
import type { AdapterConfig, BoardKind, SourceEngine } from "@/lib/community-operator-import/types";
import { labelReasons } from "@/lib/community-operator-import/quality-labels";
import { allowsFullContent, RIGHTS_BASES, RIGHTS_LABEL, type RightsBasis } from "@/lib/community-operator-import/rights";
import { BoardProbePanel } from "./BoardProbePanel";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import type { MessageKey } from "@/lib/i18n/messages";
import { call, type ContentPolicy, fmtDate, type ManagedSource, POLICY_LABEL, type TopicOption, VERDICT_TONE, importErrorText, verdictLabel } from "./api";

export function VerdictBadge({ v }: { v: string | null | undefined }) {
  const { t } = useI18n();
  const key = String(v || "NOT_PROVEN");
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[12px] font-semibold ${VERDICT_TONE[key] || VERDICT_TONE.NOT_PROVEN}`}>
      {verdictLabel(key, t)}
    </span>
  );
}

const KIND_LABEL: Record<BoardKind, MessageKey> = {
  editorial: "admin_community_import_sources_kind_editorial",
  community: "admin_community_import_sources_kind_community",
  member_qa: "admin_community_import_sources_kind_member_qa",
  directory: "admin_community_import_sources_kind_directory",
  ads: "admin_community_import_sources_kind_ads",
  unknown: "admin_community_import_sources_kind_unknown",
};

type Props = {
  sources: ManagedSource[];
  topics: TopicOption[];
  onChanged: (next?: ManagedSource[]) => void;
  onOpenBoard: (sourceId: string, boardId: string) => void;
};

export function ImportSourcesPanel({ sources, topics, onChanged, onOpenBoard }: Props) {
  const { t: tr } = useI18n();
  const [url, setUrl] = useState("");
  const [detect, setDetect] = useState<DetectResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [displayName, setDisplayName] = useState("");
  const [policy, setPolicy] = useState<ContentPolicy>("summary_link");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [probeTarget, setProbeTarget] = useState<{
    baseUrl: string;
    engine: SourceEngine;
    adapterConfig: AdapterConfig;
    engineKey: string;
    displayName: string;
  } | null>(null);

  const run = async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    setBusy(label);
    setMsg(null);
    try {
      return await fn();
    } catch (e) {
      setMsg({ tone: "err", text: importErrorText(e) });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const doDetect = async () => {
    const r = await run("detect", () => call<{ detect: DetectResult; existingSourceId: string | null }>("/sources", { body: { action: "detect", url } }));
    if (!r) return;
    setDetect(r.detect);
    setDisplayName(r.detect.displayNameSuggestion || "");
    setSelected(
      new Set(
        r.detect.boards
          .filter((b) => b.robotsAllowed && b.boardKind === "editorial" && (b.sample?.verdict === "FULL" || b.sample?.verdict === "PARTIAL"))
          .map((b) => b.boardId),
      ),
    );
    if (r.existingSourceId) setMsg({ tone: "ok", text: tr("admin_community_import_sources_already_registered", { id: r.existingSourceId }) });
  };

  const doRegister = async () => {
    if (!detect) return;
    const r = await run("register", () =>
      call<{ source: ManagedSource }>("/sources", {
        body: { action: "register", url: detect.inputUrl, displayName, contentPolicy: policy, selectedBoardIds: [...selected] },
      }),
    );
    if (!r) return;
    setMsg({ tone: "ok", text: tr("admin_community_import_sources_register_done", { name: r.source.displayName, verification: r.source.verification, n: r.source.boards.length }) });
    setDetect(null);
    setUrl("");
    setOpen(r.source.id);
    onChanged();
  };

  const sourceAction = async (sourceId: string, action: string, extra: Record<string, unknown> = {}) => {
    const r = await run(`${action}:${sourceId}`, () => call<{ source?: ManagedSource }>("/sources", { body: { action, sourceId, ...extra } }));
    if (r) onChanged();
    return r;
  };

  /** 출처 켜기·끄기 / 재검증 / 게시판 다시 찾기 — L1 확인 후 실행 */
  const confirmedSourceAction = async (
    source: ManagedSource,
    kind: "verify" | "rescan" | "toggle",
  ) => {
    const meta =
      kind === "verify"
        ? {
            title: tr("admin_community_import_sources_verify_title", { name: source.displayName }),
            description: tr("admin_community_import_sources_verify_desc"),
            confirmLabel: tr("admin_community_import_sources_verify_btn"),
          }
        : kind === "rescan"
          ? {
              title: tr("admin_community_import_sources_rescan_title", { name: source.displayName }),
              description: tr("admin_community_import_sources_rescan_desc"),
              confirmLabel: tr("admin_community_import_sources_rescan_btn"),
            }
          : source.enabled
            ? {
                title: tr("admin_community_import_sources_off_title", { name: source.displayName }),
                description: tr("admin_community_import_sources_off_desc"),
                confirmLabel: tr("admin_community_import_sources_off_btn"),
              }
            : {
                title: tr("admin_community_import_sources_on_title", { name: source.displayName }),
                description: tr("admin_community_import_sources_on_desc"),
                confirmLabel: tr("admin_community_import_sources_on_btn"),
              };
    const level = adminActionLevel(kind !== "toggle" ? "save" : source.enabled ? "disable" : "resume");
    const ok = await confirmAdminAction({ level, ko: true, destructive: kind === "toggle" && source.enabled, ...meta });
    if (!ok.ok) return;
    if (kind === "toggle") await sourceAction(source.id, "update", { patch: { enabled: !source.enabled } });
    else await sourceAction(source.id, kind);
  };

  const boardPatch = async (sourceId: string, boardId: string, patch: Record<string, unknown>) => {
    const r = await run(`board:${sourceId}:${boardId}`, () => call("/sources", { body: { action: "board", sourceId, boardId, patch } }));
    if (r) onChanged();
  };

  const collectNow = async (sourceId: string, boardId: string) => {
    const r = await run(`collect:${sourceId}:${boardId}`, () =>
      call<{ result: { listed: number; inbox: { inserted: number; changed: number } | null } }>("/collect", { body: { sourceId, boardId, pages: 1 } }),
    );
    if (r) {
      setMsg({ tone: "ok", text: tr("admin_community_import_sources_collect_done", { n: r.result.listed, inserted: r.result.inbox?.inserted ?? 0, changed: r.result.inbox?.changed ?? 0 }) });
      onChanged();
      onOpenBoard(sourceId, boardId);
    } else onChanged();
  };

  return (
    <div className="space-y-4">
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-sam-fg">{tr("admin_community_import_sources_new_site")}</h2>
          <p className="text-xs text-sam-muted mt-0.5">{tr("admin_community_import_sources_new_site_desc")}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 flex-1 text-sm"
            placeholder={tr("admin_community_import_sources_url_placeholder")}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim() && !busy) void doDetect();
            }}
          />
          {/* 화면 주 동작은 「등록」 1개 — 분석은 보조 */}
          <AdminActionButton variant="secondary" disabled={!url.trim() || !!busy} onClick={() => void doDetect()}>
            {busy === "detect" ? tr("admin_community_import_sources_detecting") : tr("admin_community_import_sources_detect_btn")}
          </AdminActionButton>
        </div>

        {detect ? (
          <div className="rounded-ui-rect border border-sam-border p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <VerdictBadge v={detect.verdict} />
              <span className="font-semibold">{detect.engine ?? tr("admin_community_import_sources_engine_unknown")}</span>
              <span className="text-sam-muted text-xs break-all">{detect.baseUrl}</span>
              <span className="text-sam-muted text-xs">robots: {detect.robots.status}</span>
              <span className="text-sam-muted text-xs">{Math.round(detect.elapsedMs / 100) / 10}s</span>
            </div>
            <p className="text-xs text-sam-muted break-words">{detect.reason}</p>
            {detect.boards.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-sam-muted text-left">
                    <tr>
                      <th className="py-1 pr-2">{tr("admin_community_import_inbox_select")}</th>
                      <th className="py-1 pr-2">{tr("admin_community_import_sources_col_board")}</th>
                      <th className="py-1 pr-2">{tr("admin_community_import_sources_col_kind")}</th>
                      <th className="py-1 pr-2">{tr("admin_community_import_sources_col_verify")}</th>
                      <th className="py-1 pr-2">{tr("admin_community_import_sources_col_list_thumb")}</th>
                      <th className="py-1 pr-2">{tr("admin_community_import_sources_col_body_sample")}</th>
                      <th className="py-1 pr-2">{tr("admin_community_import_sources_col_latest")}</th>
                      <th className="py-1">{tr("admin_community_import_sources_col_detail")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detect.boards.map((b) => {
                      // Unsampled boards (detect samples only a few) stay selectable: register re-checks them server-side.
                      const usable = b.robotsAllowed && (!b.sample || b.sample.verdict === "FULL" || b.sample.verdict === "PARTIAL");
                      return (
                        <tr key={b.boardId} className="border-t border-sam-border align-top">
                          <td className="py-1.5 pr-2">
                            <input
                              type="checkbox"
                              aria-label={tr("admin_community_import_sources_use_aria", { name: b.displayName })}
                              disabled={!usable}
                              checked={selected.has(b.boardId)}
                              onChange={(e) => {
                                const next = new Set(selected);
                                if (e.target.checked) next.add(b.boardId);
                                else next.delete(b.boardId);
                                setSelected(next);
                              }}
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <div className="font-medium">{b.displayName}</div>
                            <div className="text-[12px] text-sam-muted break-all">{b.engineKey}</div>
                          </td>
                          <td className="py-1.5 pr-2">{tr(KIND_LABEL[b.boardKind])}</td>
                          <td className="py-1.5 pr-2">
                            <VerdictBadge v={b.robotsAllowed ? b.sample?.verdict ?? "NOT_PROVEN" : "BLOCKED"} />
                            {b.sample?.reasons.length ? <div className="text-[12px] text-sam-muted mt-0.5">{labelReasons(b.sample.reasons.join(", "))}</div> : null}
                          </td>
                          <td className="py-1.5 pr-2">
                            {b.sample ? `${b.sample.listCount} / ${b.sample.withThumb}` : "—"}
                          </td>
                          <td className="py-1.5 pr-2">
                            {b.sample?.sampleTitle ? (
                              <>
                                <a className="underline break-words" href={b.sample.sampleUrl || "#"} target="_blank" rel="noreferrer noopener">
                                  {b.sample.sampleTitle}
                                </a>
                                <div className="text-[12px] text-sam-muted">
                                  {tr("admin_community_import_sources_sample_stats", { chars: b.sample.textChars, images: b.sample.imageCount })}
                                </div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-1.5 pr-2">{fmtDate(b.sample?.latestAt)}</td>
                          <td className="py-1.5">
                            {b.robotsAllowed && detect.engine ? (
                              <AdminActionButton
                                variant="neutral"
                                onClick={() =>
                                  setProbeTarget({
                                    baseUrl: detect.baseUrl,
                                    engine: detect.engine!,
                                    adapterConfig: detect.adapterConfig,
                                    engineKey: b.engineKey,
                                    displayName: b.displayName,
                                  })
                                }
                              >
                                {tr("admin_community_import_sources_row_preview_sample")}
                              </AdminActionButton>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-sam-muted">{tr("admin_community_import_sources_no_boards")}</p>
            )}
            {probeTarget ? <BoardProbePanel key={`${probeTarget.baseUrl}|${probeTarget.engineKey}`} target={probeTarget} onClose={() => setProbeTarget(null)} /> : null}
            {detect.engine && detect.verdict !== "BLOCKED" ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
                <label className="text-xs text-sam-muted">
                  {tr("admin_community_import_sources_field_display_name")}
                  <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </label>
                <label className="text-xs text-sam-muted">
                  {tr("admin_community_import_sources_field_policy")}
                  <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5" value={policy} onChange={(e) => setPolicy(e.target.value as ContentPolicy)}>
                    {(Object.keys(POLICY_LABEL) as ContentPolicy[]).map((p) => (
                      // A new source has no recorded rights yet: record them on the source card first.
                      <option key={p} value={p} disabled={p === "full"}>
                        {tr(POLICY_LABEL[p])}
                      </option>
                    ))}
                  </select>
                </label>
                <AdminActionButton variant="primary" disabled={!!busy} onClick={() => void doRegister()}>
                  {busy === "register" ? tr("admin_community_import_sources_registering") : tr("admin_community_import_sources_register_btn", { n: selected.size })}
                </AdminActionButton>
              </div>
            ) : null}
          </div>
        ) : null}
        {msg ? <p className={`text-xs break-words ${msg.tone === "err" ? "text-sam-danger" : "text-sam-success"}`}>{msg.text}</p> : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-sam-fg px-0.5">
          {tr("admin_community_import_sources_registered", { n: sources.length })}
        </h2>
        {sources.map((s) => {
          const isOpen = open === s.id;
          const collecting = s.boards.filter((b) => b.collectEnabled).length;
          return (
            <div key={s.id} data-testid="import-source-card" data-source-id={s.id} className="rounded-ui-rect border border-sam-border bg-sam-surface">
              <AdminActionButton variant="quiet" size="sm" data-testid="import-source-toggle" aria-expanded={isOpen} className="w-full h-auto! justify-start! whitespace-normal! font-normal! text-left px-3! py-2.5 flex-wrap gap-2 text-sam-fg" onClick={() => setOpen(isOpen ? null : s.id)}>
                <VerdictBadge v={s.verification} />
                <span className="font-semibold text-sm">{s.displayName}</span>
                <span className="text-[12px] text-sam-muted">{s.engine}</span>
                {!s.enabled ? <span className="text-[12px] text-sam-danger">{tr("admin_community_import_sources_disabled")}</span> : null}
                <span className="text-[12px] text-sam-muted ml-auto">
                  {tr("admin_community_import_sources_source_stats", { boards: s.boards.length, collecting, checked: fmtDate(s.status.lastCheckedAt) || tr("admin_community_import_sources_none") })}
                </span>
              </AdminActionButton>
              {isOpen ? (
                <div className="border-t border-sam-border px-3 py-3 space-y-3">
                  <div className="text-[12px] text-sam-muted break-all">
                    {s.baseUrl} · robots {s.status.robotsStatus ?? tr("admin_community_import_sources_unchecked")}
                    {s.status.aiBotsBlocked ? ` · ${tr("admin_community_import_sources_ai_bots_blocked")}` : ""}
                    {s.status.lastError ? (
                      <span className="block text-sam-danger">
                        {tr("admin_community_import_sources_recent_error", {
                          error: importErrorText({ message: s.status.lastError }),
                        })}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs"
                      value={s.contentPolicy}
                      onChange={(e) => void sourceAction(s.id, "update", { patch: { contentPolicy: e.target.value } })}
                    >
                      {(Object.keys(POLICY_LABEL) as ContentPolicy[]).map((p) => (
                        <option key={p} value={p} disabled={p === "full" && !allowsFullContent(s.rights)}>
                          {tr(POLICY_LABEL[p])}
                        </option>
                      ))}
                    </select>
                    <AdminActionButton variant="neutral" disabled={!!busy} onClick={() => void confirmedSourceAction(s, "verify")}>
                      {busy === `verify:${s.id}` ? tr("admin_community_import_sources_verifying") : tr("admin_community_import_sources_verify_btn")}
                    </AdminActionButton>
                    <AdminActionButton variant="neutral" disabled={!!busy} onClick={() => void confirmedSourceAction(s, "rescan")}>
                      {busy === `rescan:${s.id}` ? tr("admin_community_import_sources_rescanning") : tr("admin_community_import_sources_rescan_boards_btn")}
                    </AdminActionButton>
                    <AdminActionButton
                      variant="neutral"
                      disabled={!!busy}
                      onClick={() => void confirmedSourceAction(s, "toggle")}
                    >
                      {s.enabled ? tr("admin_community_import_sources_off_btn") : tr("admin_community_import_sources_on_btn")}
                    </AdminActionButton>
                  </div>
                  <RightsForm
                    key={`rights:${s.id}:${s.rights.rightsBasis}:${s.rights.attributionRequired}:${s.rights.note ?? ""}`}
                    source={s}
                    busy={!!busy}
                    onSave={(rights) => void sourceAction(s.id, "update", { patch: { rights } })}
                  />
                  <AdapterConfigForm
                    key={`${s.id}:${JSON.stringify(s.adapterConfig)}`}
                    source={s}
                    busy={!!busy}
                    onSave={(adapterConfig) => void sourceAction(s.id, "update", { patch: { adapterConfig } })}
                  />
                  {s.engine === "rss_atom" ? (
                    <KeywordBoardForm
                      source={s}
                      busy={!!busy}
                      onPreview={(engineKey, name) =>
                        setProbeTarget({ baseUrl: s.baseUrl, engine: s.engine, adapterConfig: s.adapterConfig, engineKey, displayName: name })
                      }
                      onAdd={(engineKey, name) => void sourceAction(s.id, "addBoard", { engineKey, displayName: name })}
                    />
                  ) : null}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-left text-sam-muted">
                        <tr>
                          <th className="py-1 pr-2">{tr("admin_community_import_sources_col_board")}</th>
                          <th className="py-1 pr-2">{tr("admin_community_import_sources_col_status")}</th>
                          <th className="py-1 pr-2">{tr("admin_community_import_dibay_topic")}</th>
                          <th className="py-1 pr-2">{tr("admin_community_import_sources_col_enabled")}</th>
                          <th className="py-1 pr-2">{tr("admin_community_import_sources_col_auto_collect")}</th>
                          <th className="py-1">{tr("admin_community_import_sources_col_actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.boards.map((b) => (
                          <tr key={b.boardId} className="border-t border-sam-border align-top">
                            <td className="py-1.5 pr-2">
                              <div className="font-medium">{b.displayName}</div>
                              <div className="text-[12px] text-sam-muted">
                                {tr(KIND_LABEL[b.boardKind])} · {tr("admin_community_import_sources_board_latest", { date: fmtDate(b.status.latestSourceAt) || "—" })}
                              </div>
                            </td>
                            <td className="py-1.5 pr-2">
                              <VerdictBadge v={b.status.lastVerdict} />
                              {b.status.lastError ? <div className="text-[12px] text-sam-danger max-w-[220px] break-words">{labelReasons(b.status.lastError)}</div> : null}
                            </td>
                            <td className="py-1.5 pr-2">
                              <select
                                className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs"
                                aria-label={tr("admin_community_import_sources_topic_aria", { name: b.displayName })}
                                value={b.defaultTopicId ?? ""}
                                onChange={(e) => void boardPatch(s.id, b.boardId, { defaultTopicId: e.target.value || null })}
                              >
                                <option value="">{tr("admin_community_import_sources_topic_on_publish")}</option>
                                {topics.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 pr-2">
                              <input type="checkbox" aria-label={tr("admin_community_import_sources_board_use_aria", { name: b.displayName })} checked={b.enabled} onChange={(e) => void boardPatch(s.id, b.boardId, { enabled: e.target.checked })} />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="checkbox"
                                aria-label={tr("admin_community_import_sources_auto_collect_aria", { name: b.displayName })}
                                checked={b.collectEnabled}
                                title={tr("admin_community_import_sources_auto_collect_hint")}
                                onChange={(e) => void boardPatch(s.id, b.boardId, { collectEnabled: e.target.checked })}
                              />
                            </td>
                            <td className="py-1.5">
                              <div className="flex gap-1">
                                <AdminActionButton
                                  variant="neutral"
                                  disabled={!!busy || !s.enabled}
                                  onClick={() => void collectNow(s.id, b.boardId)}
                                >
                                  {busy === `collect:${s.id}:${b.boardId}` ? tr("admin_community_import_sources_collecting") : tr("admin_community_import_sources_collect_now")}
                                </AdminActionButton>
                                <AdminActionButton variant="neutral" onClick={() => onOpenBoard(s.id, b.boardId)}>
                                  {tr("admin_community_import_sources_board_inbox")}
                                </AdminActionButton>
                                <AdminActionButton
                                  variant="neutral"
                                  onClick={() =>
                                    setProbeTarget({
                                      baseUrl: s.baseUrl,
                                      engine: s.engine,
                                      adapterConfig: s.adapterConfig,
                                      engineKey: b.engineKey,
                                      displayName: `${s.displayName} · ${b.displayName}`,
                                    })
                                  }
                                >
                                  {tr("admin_community_import_sources_board_preview_sample")}
                                </AdminActionButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {probeTarget && probeTarget.baseUrl === s.baseUrl ? (
                    <BoardProbePanel key={`${probeTarget.baseUrl}|${probeTarget.engineKey}`} target={probeTarget} onClose={() => setProbeTarget(null)} />
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}

/** Feed board narrowed by keywords (e.g. Korean travel/golf news → only Philippines topics). */
function KeywordBoardForm({
  source,
  busy,
  onPreview,
  onAdd,
}: {
  source: ManagedSource;
  busy: boolean;
  onPreview: (engineKey: string, name: string) => void;
  onAdd: (engineKey: string, name: string) => void;
}) {
  const { t: tr } = useI18n();
  const feeds = source.boards.filter((b) => !b.engineKey.includes("#"));
  const [feed, setFeed] = useState(feeds[0]?.engineKey ?? "");
  const [keywords, setKeywords] = useState("필리핀,세부,마닐라,클락,보라카이");
  const [name, setName] = useState("");
  const kw = keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .join(",");
  const engineKey = feed && kw ? `${feed.split("#")[0]}#keyword=${encodeURIComponent(kw)}` : "";
  const label = name.trim() || `${source.displayName} · ${kw.split(",").slice(0, 3).join("·")}`;
  if (!feeds.length) return null;
  return (
    <div className="rounded-ui-rect border border-sam-border p-2 space-y-1.5">
      <div className="text-[12px] font-semibold">{tr("admin_community_import_sources_keyword_board_title")}</div>
      <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" value={feed} onChange={(e) => setFeed(e.target.value)}>
          {feeds.map((b) => (
            <option key={b.boardId} value={b.engineKey}>
              {b.displayName}
            </option>
          ))}
        </select>
        <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={tr("admin_community_import_sources_keyword_placeholder")} />
        <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("admin_community_import_sources_board_name_optional")} />
        <AdminActionButton variant="neutral" disabled={!engineKey} onClick={() => onPreview(engineKey, label)}>
          {tr("admin_community_import_sources_preview_sample")}
        </AdminActionButton>
        <AdminActionButton variant="secondary" disabled={!engineKey || busy} onClick={() => onAdd(engineKey, label)}>
          {tr("admin_community_import_sources_add_as_board")}
        </AdminActionButton>
      </div>
    </div>
  );
}

/** Republication rights of a source: full body + images and hiding the 출처 block depend on them. */
function RightsForm({
  source,
  busy,
  onSave,
}: {
  source: ManagedSource;
  busy: boolean;
  onSave: (rights: { rightsBasis: RightsBasis; attributionRequired: boolean; note: string }) => void;
}) {
  const { t: tr } = useI18n();
  const [basis, setBasis] = useState<RightsBasis>(source.rights.rightsBasis);
  const [attribution, setAttribution] = useState(source.rights.attributionRequired);
  const [note, setNote] = useState(source.rights.note ?? "");
  const ccOrNone = basis === "unverified" || basis.startsWith("cc_");
  const dirty = basis !== source.rights.rightsBasis || attribution !== source.rights.attributionRequired || note !== (source.rights.note ?? "");
  return (
    <div data-testid="import-source-rights" className="rounded-ui-rect border border-sam-border p-2 space-y-1.5">
      <div className="text-[12px] font-semibold">
        {tr("admin_community_import_sources_rights_current", { rights: RIGHTS_LABEL[source.rights.rightsBasis] })}
        {source.rights.confirmedAt ? ` ${tr("admin_community_import_sources_rights_confirmed", { at: fmtDate(source.rights.confirmedAt) })}` : ""}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <select aria-label={tr("admin_community_import_sources_rights")} className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" value={basis} onChange={(e) => setBasis(e.target.value as RightsBasis)}>
          {RIGHTS_BASES.map((b) => (
            <option key={b} value={b}>
              {RIGHTS_LABEL[b]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[12px] text-sam-muted">
          <input type="checkbox" checked={ccOrNone || attribution} disabled={ccOrNone} onChange={(e) => setAttribution(e.target.checked)} />
          {tr("admin_community_import_sources_attribution_required")}
        </label>
        <input
          aria-label={tr("admin_community_import_sources_rights_basis")}
          className="sm:col-span-2 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs"
          placeholder={tr("admin_community_import_sources_rights_basis_placeholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <AdminActionButton
        variant="secondary"
        disabled={busy || !dirty || (basis !== "unverified" && !note.trim())}
        onClick={() => onSave({ rightsBasis: basis, attributionRequired: ccOrNone || attribution, note })}
      >
        {tr("admin_community_import_sources_rights_save")}
      </AdminActionButton>
    </div>
  );
}

/** Per-site extraction settings (stored in adapter_config) — adjusts a site without code changes. */
function AdapterConfigForm({
  source,
  busy,
  onSave,
}: {
  source: ManagedSource;
  busy: boolean;
  onSave: (cfg: AdapterConfig) => void;
}) {
  const { t: tr } = useI18n();
  const cfg = source.adapterConfig || {};
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState((cfg.bodySelectors || []).join(", "));
  const [remove, setRemove] = useState((cfg.removeSelectors || []).join(", "));
  const [date, setDate] = useState(cfg.dateSelector || "");
  const [tpl, setTpl] = useState(cfg.itemUrlTemplate || "");
  const list = (v: string) =>
    v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  if (!open) {
    return (
      <AdminActionButton variant="neutral" onClick={() => setOpen(true)}>
        {tr("admin_community_import_sources_adapter_config")}
        {cfg.bodySelectors?.length ? ` · ${tr("admin_community_import_sources_body_selectors", { list: cfg.bodySelectors.join(", ") })}` : ""}
      </AdminActionButton>
    );
  }
  return (
    <div className="rounded-ui-rect border border-sam-border p-2 space-y-1.5">
      <div className="text-[12px] font-semibold">{tr("admin_community_import_sources_adapter_title")}</div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <label className="text-[12px] text-sam-muted">
          {tr("admin_community_import_sources_adapter_body")}
          <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-xs mt-0.5" value={body} onChange={(e) => setBody(e.target.value)} placeholder="#ct, .article-body" />
        </label>
        <label className="text-[12px] text-sam-muted">
          {tr("admin_community_import_sources_adapter_remove")}
          <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-xs mt-0.5" value={remove} onChange={(e) => setRemove(e.target.value)} placeholder=".share, .ad" />
        </label>
        <label className="text-[12px] text-sam-muted">
          {tr("admin_community_import_sources_adapter_date")}
          <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-xs mt-0.5" value={date} onChange={(e) => setDate(e.target.value)} placeholder=".date" />
        </label>
        {source.engine === "html" ? (
          <label className="text-[12px] text-sam-muted">
            {tr("admin_community_import_sources_adapter_url_template")}
            <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-xs mt-0.5" value={tpl} onChange={(e) => setTpl(e.target.value)} placeholder="/news/article.html?no" />
          </label>
        ) : null}
      </div>
      <div className="flex gap-1.5">
        <AdminActionButton
          variant="secondary"
          disabled={busy}
          onClick={() =>
            onSave({
              ...cfg,
              bodySelectors: list(body),
              removeSelectors: list(remove),
              dateSelector: date.trim() || undefined,
              itemUrlTemplate: tpl.trim() || undefined,
            })
          }
        >
          {tr("admin_community_import_sources_adapter_save")}
        </AdminActionButton>
        <AdminActionButton variant="neutral" onClick={() => setOpen(false)}>
          {tr("admin_community_import_sources_adapter_close")}
        </AdminActionButton>
      </div>
    </div>
  );
}
