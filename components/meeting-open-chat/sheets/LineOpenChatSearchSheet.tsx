"use client";

import { useState } from "react";
import type { MeetingOpenChatMessagePublic } from "@/lib/meeting-open-chat/types";

export function LineOpenChatSearchSheet({
  open,
  onClose,
  apiMessagesBase,
}: {
  open: boolean;
  onClose: () => void;
  /** .../rooms/[roomId]/messages (쿼리만 붙임) */
  apiMessagesBase: string;
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MeetingOpenChatMessagePublic[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const search = async () => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      setErr(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("q", term);
      params.set("limit", "40");
      const res = await fetch(`${apiMessagesBase}?${params.toString()}`, { credentials: "include" });
      const json = (await res.json()) as { ok?: boolean; messages?: MeetingOpenChatMessagePublic[]; error?: string };
      if (!res.ok || !json.ok) {
        setErr(json.error ?? "검색 실패");
        setResults([]);
        return;
      }
      setResults(json.messages ?? []);
    } catch {
      setErr("네트워크 오류");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="메시지 검색">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="닫기" onClick={onClose} />
      <div className="relative max-h-[80vh] rounded-t-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder="메시지 내용 검색"
            className="min-w-0 flex-1 rounded-full border border-gray-200 px-3 py-2 text-sm"
            maxLength={80}
          />
          <button
            type="button"
            onClick={() => void search()}
            className="shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
          >
            검색
          </button>
          <button type="button" onClick={onClose} className="shrink-0 text-sm font-semibold text-emerald-700">
            닫기
          </button>
        </div>
        <div className="max-h-[calc(80vh-52px)] overflow-y-auto px-3 py-2 pb-6">
          {loading && <p className="py-6 text-center text-sm text-gray-500">검색 중…</p>}
          {err && <p className="py-2 text-center text-sm text-red-600">{err}</p>}
          {!loading && !err && results.length === 0 && q.trim() && (
            <p className="py-6 text-center text-sm text-gray-500">결과가 없습니다.</p>
          )}
          {!loading && !q.trim() && <p className="py-6 text-center text-sm text-gray-400">검색어를 입력하세요.</p>}
          <ul className="space-y-2">
            {results.map((m) => (
              <li key={m.id} className="rounded-xl border border-gray-100 bg-gray-50 p-2 text-sm">
                <div className="text-[11px] text-gray-500">
                  {m.sender_open_nickname ?? (m.message_type === "system" ? "시스템" : "—")} ·{" "}
                  {new Date(m.created_at).toLocaleString("ko-KR")}
                  {m.reply_to_message_id && m.message_type !== "system" ? " · 답장" : ""}
                </div>
                {m.attachments?.some((a) => a.fileType === "image") && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.attachments
                      .filter((a) => a.fileType === "image")
                      .map((a) => (
                        <a key={a.id} href={a.fileUrl} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={a.fileUrl}
                            alt=""
                            className="h-16 w-16 rounded object-cover"
                            loading="lazy"
                          />
                        </a>
                      ))}
                  </div>
                )}
                {(m.message_type === "system" || m.content.trim().length > 0) && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-gray-900">{m.content}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
