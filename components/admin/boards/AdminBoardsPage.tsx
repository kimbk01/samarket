"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { AdminBoardRow } from "@/lib/admin-boards/getBoardsFromDb";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminBoardCreateForm } from "@/components/admin/boards/AdminBoardCreateForm";

export function AdminBoardsPage() {
  const [boards, setBoards] = useState<AdminBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/admin/boards", { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        boards?: AdminBoardRow[];
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setBoards([]);
        setListError(
          j.error === "supabase_unconfigured"
            ? "Supabase 서비스 키가 없어 목록을 불러올 수 없습니다. Vercel 환경변수(SUPABASE_SERVICE_ROLE_KEY 등)를 확인하세요."
            : j.error === "forbidden"
              ? "관리자만 볼 수 있습니다."
              : (j.error ?? `목록을 불러오지 못했습니다. (${res.status})`)
        );
        return;
      }
      setBoards(Array.isArray(j.boards) ? j.boards : []);
    } catch {
      setBoards([]);
      setListError("목록 요청에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageHeader title="게시판 관리" />
        <button
          type="button"
          disabled={loading}
          onClick={() => setCreateOpen(true)}
          className="shrink-0 rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white hover:bg-signature/90 disabled:opacity-50"
        >
          게시판 추가
        </button>
      </div>

      <AdminBoardCreateForm open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => void load()} />

      {listError ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">{listError}</div>
      ) : null}

      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          불러오는 중…
        </div>
      ) : boards.length === 0 && !listError ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          등록된 게시판이 없습니다. 상단 <strong className="text-sam-fg">게시판 추가</strong>로 생성하거나, DB에 services·boards 데이터를
          넣을 수 있습니다.
        </div>
      ) : boards.length === 0 ? null : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">서비스</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">이름</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">slug</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">스킨/폼</th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">노출</th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">웹 보기</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => (
                <tr key={b.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                  <td className="px-3 py-2.5 text-sam-fg">
                    {b.service_name ?? b.service_slug ?? b.service_id}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-sam-fg">{b.name}</td>
                  <td className="px-3 py-2.5 font-mono text-[13px] text-sam-muted">{b.slug}</td>
                  <td className="px-3 py-2.5 text-sam-muted">
                    {b.skin_type} / {b.form_type}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                        b.is_active ? "bg-green-50 text-green-800" : "bg-sam-surface-muted text-sam-muted"
                      }`}
                    >
                      {b.is_active ? "노출" : "숨김"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href="/community"
                      className="text-signature hover:underline"
                    >
                      웹에서 보기
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
