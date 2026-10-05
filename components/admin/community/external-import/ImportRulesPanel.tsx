"use client";

import { useCallback, useEffect, useState } from "react";
import { call, type ImportRule, type ManagedSource } from "./api";

const EMPTY = { scope: "global" as ImportRule["scope"], sourceSite: "", sourceBoard: "", findText: "", replaceText: "", isRegex: false, note: "" };

export function ImportRulesPanel({ sources }: { sources: ManagedSource[] }) {
  const [rules, setRules] = useState<ImportRule[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRules((await call<{ rules: ImportRule[] }>("/rules")).rules);
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const boards = sources.find((s) => s.id === form.sourceSite)?.boards ?? [];

  const save = async () => {
    setMsg(null);
    try {
      await call("/rules", {
        body: {
          action: "save",
          rule: {
            scope: form.scope,
            sourceSite: form.scope === "global" ? null : form.sourceSite || null,
            sourceBoard: form.scope === "board" ? form.sourceBoard || null : null,
            findText: form.findText,
            replaceText: form.replaceText,
            isRegex: form.isRegex,
            note: form.note || null,
          },
        },
      });
      setForm(EMPTY);
      setMsg({ tone: "ok", text: "규칙을 저장했습니다. 이후 미리보기·게시·업데이트에 적용됩니다." });
      await load();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    }
  };

  const toggle = async (r: ImportRule) => {
    try {
      setRules((await call<{ rules: ImportRule[] }>("/rules", { body: { action: "toggle", id: r.id, enabled: !r.enabled } })).rules);
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="space-y-4">
      <section className="sam-card sam-card-pad space-y-2">
        <h2 className="text-sm font-semibold">일괄 변경 규칙</h2>
        <p className="text-xs text-sam-muted">
          제목·본문의 문구를 일괄 치환합니다 (예: 홍보 문구 제거, 표기 통일). 전체 → 출처 → 게시판 순서로 적용됩니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className="sam-input text-sm" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as ImportRule["scope"] })}>
            <option value="global">전체 출처</option>
            <option value="source">특정 출처</option>
            <option value="board">특정 게시판</option>
          </select>
          <select className="sam-input text-sm" disabled={form.scope === "global"} value={form.sourceSite} onChange={(e) => setForm({ ...form, sourceSite: e.target.value, sourceBoard: "" })}>
            <option value="">출처 선택</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
          <select className="sam-input text-sm" disabled={form.scope !== "board"} value={form.sourceBoard} onChange={(e) => setForm({ ...form, sourceBoard: e.target.value })}>
            <option value="">게시판 선택</option>
            {boards.map((b) => (
              <option key={b.boardId} value={b.boardId}>
                {b.displayName}
              </option>
            ))}
          </select>
          <input className="sam-input text-sm" placeholder="찾을 문구" value={form.findText} onChange={(e) => setForm({ ...form, findText: e.target.value })} />
          <input className="sam-input text-sm" placeholder="바꿀 문구 (비우면 삭제)" value={form.replaceText} onChange={(e) => setForm({ ...form, replaceText: e.target.value })} />
          <input className="sam-input text-sm" placeholder="메모" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-sam-muted">
            <input type="checkbox" checked={form.isRegex} onChange={(e) => setForm({ ...form, isRegex: e.target.checked })} /> 정규식
          </label>
          <button type="button" className="sam-btn sam-btn-primary text-sm ml-auto" disabled={!form.findText} onClick={() => void save()}>
            규칙 추가
          </button>
        </div>
        {msg ? <p className={`text-xs break-words ${msg.tone === "err" ? "text-rose-600" : "text-emerald-700"}`}>{msg.text}</p> : null}
      </section>
      <section className="sam-card">
        {rules.length === 0 ? <p className="p-3 text-xs text-sam-muted">등록된 규칙이 없습니다.</p> : null}
        <ul>
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2 border-b border-sam-border text-xs">
              <span className="rounded-full border border-sam-border px-1.5 text-[10px]">
                {r.scope === "global" ? "전체" : r.scope === "source" ? r.sourceSite : `${r.sourceSite}/${r.sourceBoard}`}
              </span>
              <code className="break-all">{r.findText}</code>
              <span className="text-sam-muted">→</span>
              <code className="break-all">{r.replaceText || "(삭제)"}</code>
              {r.isRegex ? <span className="text-[10px] text-sam-muted">regex</span> : null}
              <button type="button" className="sam-btn sam-btn-ghost text-[11px] ml-auto" onClick={() => void toggle(r)}>
                {r.enabled ? "사용 중" : "꺼짐"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
