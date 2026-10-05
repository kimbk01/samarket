"use client";

import { useState } from "react";
import type { DetectResult } from "@/lib/community-operator-import/detect";
import type { AdapterConfig, BoardKind, SourceEngine } from "@/lib/community-operator-import/types";
import { BoardProbePanel } from "./BoardProbePanel";
import { call, type ContentPolicy, fmtDate, type ManagedSource, POLICY_LABEL, type TopicOption, VERDICT_TONE } from "./api";

export function VerdictBadge({ v }: { v: string | null | undefined }) {
  const key = String(v || "NOT_PROVEN");
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${VERDICT_TONE[key] || VERDICT_TONE.NOT_PROVEN}`}>
      {key === "NOT_PROVEN" ? "미검증" : key}
    </span>
  );
}

const KIND_LABEL: Record<BoardKind, string> = {
  editorial: "기사·정보",
  community: "커뮤니티",
  member_qa: "회원 Q&A",
  directory: "업소록",
  ads: "광고",
  unknown: "미분류",
};

type Props = {
  sources: ManagedSource[];
  topics: TopicOption[];
  onChanged: (next?: ManagedSource[]) => void;
  onOpenBoard: (sourceId: string, boardId: string) => void;
};

export function ImportSourcesPanel({ sources, topics, onChanged, onOpenBoard }: Props) {
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
      setMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) });
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
    if (r.existingSourceId) setMsg({ tone: "ok", text: `이미 등록된 출처(${r.existingSourceId})입니다. 등록하면 게시판이 갱신됩니다.` });
  };

  const doRegister = async () => {
    if (!detect) return;
    const r = await run("register", () =>
      call<{ source: ManagedSource }>("/sources", {
        body: { action: "register", url: detect.inputUrl, displayName, contentPolicy: policy, selectedBoardIds: [...selected] },
      }),
    );
    if (!r) return;
    setMsg({ tone: "ok", text: `등록됨: ${r.source.displayName} (${r.source.verification}) · 게시판 ${r.source.boards.length}개` });
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

  const boardPatch = async (sourceId: string, boardId: string, patch: Record<string, unknown>) => {
    const r = await run(`board:${sourceId}:${boardId}`, () => call("/sources", { body: { action: "board", sourceId, boardId, patch } }));
    if (r) onChanged();
  };

  const collectNow = async (sourceId: string, boardId: string) => {
    const r = await run(`collect:${sourceId}:${boardId}`, () =>
      call<{ result: { listed: number; inbox: { inserted: number; changed: number } | null } }>("/collect", { body: { sourceId, boardId, pages: 1 } }),
    );
    if (r) {
      setMsg({ tone: "ok", text: `수집 완료: ${r.result.listed}건 (신규 ${r.result.inbox?.inserted ?? 0}, 변경 ${r.result.inbox?.changed ?? 0})` });
      onChanged();
      onOpenBoard(sourceId, boardId);
    } else onChanged();
  };

  return (
    <div className="space-y-4">
      <section className="sam-card sam-card-pad space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-sam-fg">새 사이트 등록</h2>
          <p className="text-xs text-sam-muted mt-0.5">
            URL만 입력하면 robots.txt 확인 → 사이트 유형 판별 → 실제 게시판 탐색 → 게시판별 목록·본문 샘플 검증을 서버가 수행합니다. 차단·로그인·캡차는 우회하지 않습니다.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="sam-input flex-1 text-sm"
            placeholder="https://example.com 또는 게시판 주소"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim() && !busy) void doDetect();
            }}
          />
          <button type="button" className="sam-btn sam-btn-primary text-sm" disabled={!url.trim() || !!busy} onClick={() => void doDetect()}>
            {busy === "detect" ? "분석 중… (최대 45초)" : "사이트 분석"}
          </button>
        </div>

        {detect ? (
          <div className="rounded-ui-rect border border-sam-border p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <VerdictBadge v={detect.verdict} />
              <span className="font-semibold">{detect.engine ?? "유형 판별 실패"}</span>
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
                      <th className="py-1 pr-2">선택</th>
                      <th className="py-1 pr-2">게시판</th>
                      <th className="py-1 pr-2">성격</th>
                      <th className="py-1 pr-2">검증</th>
                      <th className="py-1 pr-2">목록/썸네일</th>
                      <th className="py-1 pr-2">본문 샘플</th>
                      <th className="py-1 pr-2">최신글</th>
                      <th className="py-1">확인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detect.boards.map((b) => {
                      const usable = b.robotsAllowed && (b.sample?.verdict === "FULL" || b.sample?.verdict === "PARTIAL");
                      return (
                        <tr key={b.boardId} className="border-t border-sam-border align-top">
                          <td className="py-1.5 pr-2">
                            <input
                              type="checkbox"
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
                            <div className="text-[10px] text-sam-muted break-all">{b.engineKey}</div>
                          </td>
                          <td className="py-1.5 pr-2">{KIND_LABEL[b.boardKind]}</td>
                          <td className="py-1.5 pr-2">
                            <VerdictBadge v={b.robotsAllowed ? b.sample?.verdict ?? "NOT_PROVEN" : "BLOCKED"} />
                            {b.sample?.reasons.length ? <div className="text-[10px] text-sam-muted mt-0.5">{b.sample.reasons.join(", ")}</div> : null}
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
                                <div className="text-[10px] text-sam-muted">
                                  본문 {b.sample.textChars}자 · 이미지 {b.sample.imageCount}
                                </div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-1.5 pr-2">{fmtDate(b.sample?.latestAt)}</td>
                          <td className="py-1.5">
                            {b.robotsAllowed && detect.engine ? (
                              <button
                                type="button"
                                className="sam-btn sam-btn-ghost text-[11px]"
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
                                샘플 보기
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-sam-muted">발견된 게시판이 없습니다.</p>
            )}
            {probeTarget ? <BoardProbePanel key={`${probeTarget.baseUrl}|${probeTarget.engineKey}`} target={probeTarget} onClose={() => setProbeTarget(null)} /> : null}
            {detect.engine && detect.verdict !== "BLOCKED" ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
                <label className="text-xs text-sam-muted">
                  표시 이름
                  <input className="sam-input w-full text-sm mt-0.5" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </label>
                <label className="text-xs text-sam-muted">
                  게시 정책
                  <select className="sam-input w-full text-sm mt-0.5" value={policy} onChange={(e) => setPolicy(e.target.value as ContentPolicy)}>
                    {(Object.keys(POLICY_LABEL) as ContentPolicy[]).map((p) => (
                      <option key={p} value={p}>
                        {POLICY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="sam-btn sam-btn-primary text-sm" disabled={!!busy} onClick={() => void doRegister()}>
                  {busy === "register" ? "재검증 후 등록 중…" : `등록 (게시판 ${selected.size}개 사용)`}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {msg ? <p className={`text-xs break-words ${msg.tone === "err" ? "text-rose-600" : "text-emerald-700"}`}>{msg.text}</p> : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-sam-fg px-0.5">등록된 출처 ({sources.length})</h2>
        {sources.map((s) => {
          const isOpen = open === s.id;
          const collecting = s.boards.filter((b) => b.collectEnabled).length;
          return (
            <div key={s.id} className="sam-card">
              <button type="button" className="w-full text-left px-3 py-2.5 flex flex-wrap items-center gap-2" onClick={() => setOpen(isOpen ? null : s.id)}>
                <VerdictBadge v={s.verification} />
                <span className="font-semibold text-sm">{s.displayName}</span>
                <span className="text-[11px] text-sam-muted">{s.engine}</span>
                {!s.enabled ? <span className="text-[11px] text-rose-600">비활성</span> : null}
                <span className="text-[11px] text-sam-muted ml-auto">
                  게시판 {s.boards.length} · 자동수집 {collecting} · 확인 {fmtDate(s.status.lastCheckedAt) || "없음"}
                </span>
              </button>
              {isOpen ? (
                <div className="border-t border-sam-border px-3 py-3 space-y-3">
                  <div className="text-[11px] text-sam-muted break-all">
                    {s.baseUrl} · robots {s.status.robotsStatus ?? "미확인"}
                    {s.status.aiBotsBlocked ? " · AI 봇 차단 명시" : ""}
                    {s.status.lastError ? <span className="block text-rose-600">최근 오류: {s.status.lastError}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      className="sam-input text-xs"
                      value={s.contentPolicy}
                      onChange={(e) => void sourceAction(s.id, "update", { patch: { contentPolicy: e.target.value } })}
                    >
                      {(Object.keys(POLICY_LABEL) as ContentPolicy[]).map((p) => (
                        <option key={p} value={p}>
                          {POLICY_LABEL[p]}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="sam-btn sam-btn-ghost text-xs" disabled={!!busy} onClick={() => void sourceAction(s.id, "verify")}>
                      {busy === `verify:${s.id}` ? "검증 중…" : "재검증"}
                    </button>
                    <button type="button" className="sam-btn sam-btn-ghost text-xs" disabled={!!busy} onClick={() => void sourceAction(s.id, "rescan")}>
                      {busy === `rescan:${s.id}` ? "탐색 중…" : "게시판 다시 찾기"}
                    </button>
                    <button
                      type="button"
                      className="sam-btn sam-btn-ghost text-xs"
                      disabled={!!busy}
                      onClick={() => void sourceAction(s.id, "update", { patch: { enabled: !s.enabled } })}
                    >
                      {s.enabled ? "출처 끄기" : "출처 켜기"}
                    </button>
                  </div>
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
                          <th className="py-1 pr-2">게시판</th>
                          <th className="py-1 pr-2">상태</th>
                          <th className="py-1 pr-2">DIBAY 주제</th>
                          <th className="py-1 pr-2">사용</th>
                          <th className="py-1 pr-2">자동수집</th>
                          <th className="py-1">작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.boards.map((b) => (
                          <tr key={b.boardId} className="border-t border-sam-border align-top">
                            <td className="py-1.5 pr-2">
                              <div className="font-medium">{b.displayName}</div>
                              <div className="text-[10px] text-sam-muted">
                                {KIND_LABEL[b.boardKind]} · 최신 {fmtDate(b.status.latestSourceAt) || "—"}
                              </div>
                            </td>
                            <td className="py-1.5 pr-2">
                              <VerdictBadge v={b.status.lastVerdict} />
                              {b.status.lastError ? <div className="text-[10px] text-rose-600 max-w-[220px] break-words">{b.status.lastError}</div> : null}
                            </td>
                            <td className="py-1.5 pr-2">
                              <select
                                className="sam-input text-xs"
                                value={b.defaultTopicId ?? ""}
                                onChange={(e) => void boardPatch(s.id, b.boardId, { defaultTopicId: e.target.value || null })}
                              >
                                <option value="">(게시 시 선택)</option>
                                {topics.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 pr-2">
                              <input type="checkbox" checked={b.enabled} onChange={(e) => void boardPatch(s.id, b.boardId, { enabled: e.target.checked })} />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="checkbox"
                                checked={b.collectEnabled}
                                title="검증된 출처의 기사·정보·커뮤니티 게시판만 정기수집할 수 있습니다"
                                onChange={(e) => void boardPatch(s.id, b.boardId, { collectEnabled: e.target.checked })}
                              />
                            </td>
                            <td className="py-1.5">
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  className="sam-btn sam-btn-ghost text-[11px]"
                                  disabled={!!busy || !s.enabled}
                                  onClick={() => void collectNow(s.id, b.boardId)}
                                >
                                  {busy === `collect:${s.id}:${b.boardId}` ? "수집 중…" : "지금 수집"}
                                </button>
                                <button type="button" className="sam-btn sam-btn-ghost text-[11px]" onClick={() => onOpenBoard(s.id, b.boardId)}>
                                  수집함
                                </button>
                                <button
                                  type="button"
                                  className="sam-btn sam-btn-ghost text-[11px]"
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
                                  샘플 보기
                                </button>
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
      <div className="text-[11px] font-semibold">키워드 게시판 추가 — 이 피드에서 키워드가 들어간 글만 수집</div>
      <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <select className="sam-input text-xs" value={feed} onChange={(e) => setFeed(e.target.value)}>
          {feeds.map((b) => (
            <option key={b.boardId} value={b.engineKey}>
              {b.displayName}
            </option>
          ))}
        </select>
        <input className="sam-input text-xs" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="쉼표로 구분: 필리핀,세부" />
        <input className="sam-input text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="게시판 이름 (선택)" />
        <button type="button" className="sam-btn sam-btn-ghost text-[11px]" disabled={!engineKey} onClick={() => onPreview(engineKey, label)}>
          샘플 보기
        </button>
        <button type="button" className="sam-btn sam-btn-secondary text-[11px]" disabled={!engineKey || busy} onClick={() => onAdd(engineKey, label)}>
          게시판으로 추가
        </button>
      </div>
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
      <button type="button" className="sam-btn sam-btn-ghost text-[11px]" onClick={() => setOpen(true)}>
        수집 설정 (본문 위치·제거 영역·날짜)
        {cfg.bodySelectors?.length ? ` · 본문 ${cfg.bodySelectors.join(", ")}` : ""}
      </button>
    );
  }
  return (
    <div className="rounded-ui-rect border border-sam-border p-2 space-y-1.5">
      <div className="text-[11px] font-semibold">수집 설정 — 비워 두면 자동 판별. 저장 후 「샘플 보기」로 결과를 확인하세요.</div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <label className="text-[11px] text-sam-muted">
          본문 위치 (CSS 선택자, 쉼표 구분)
          <input className="sam-input w-full text-xs mt-0.5" value={body} onChange={(e) => setBody(e.target.value)} placeholder="#ct, .article-body" />
        </label>
        <label className="text-[11px] text-sam-muted">
          본문에서 뺄 영역
          <input className="sam-input w-full text-xs mt-0.5" value={remove} onChange={(e) => setRemove(e.target.value)} placeholder=".share, .ad" />
        </label>
        <label className="text-[11px] text-sam-muted">
          게시일 위치
          <input className="sam-input w-full text-xs mt-0.5" value={date} onChange={(e) => setDate(e.target.value)} placeholder=".date" />
        </label>
        {source.engine === "html" ? (
          <label className="text-[11px] text-sam-muted">
            글 주소 형식
            <input className="sam-input w-full text-xs mt-0.5" value={tpl} onChange={(e) => setTpl(e.target.value)} placeholder="/news/article.html?no" />
          </label>
        ) : null}
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          className="sam-btn sam-btn-secondary text-[11px]"
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
          설정 저장
        </button>
        <button type="button" className="sam-btn sam-btn-ghost text-[11px]" onClick={() => setOpen(false)}>
          닫기
        </button>
      </div>
    </div>
  );
}
