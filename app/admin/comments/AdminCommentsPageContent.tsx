"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getAdminComments } from "@/lib/admin-comments/getAdminComments";
import { deleteCommentAdmin } from "@/lib/admin-comments/updateCommentAdmin";
import type { AdminCommentRow } from "@/lib/admin-comments/getAdminComments";
import { formatTimeAgo } from "@/lib/utils/format";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export function AdminCommentsPageContent() {
  const [comments, setComments] = useState<AdminCommentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getAdminComments();
    setComments(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("이 댓글을 삭제할까요?")) return;
      const res = await deleteCommentAdmin(id);
      if (res.ok) load();
    },
    [load]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader title="댓글 관리" />
      {loading ? (
        <div className="py-12 text-center text-[14px] text-gray-500">불러오는 중…</div>
      ) : comments.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          댓글이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-gray-900">{c.content}</p>
                <p className="mt-1 text-[12px] text-gray-500">
                  post: {c.post_id} · user: {c.user_id} · {formatTimeAgo(c.created_at)}
                </p>
                <Link
                  href={`/post/${c.post_id}`}
                  className="mt-1 inline-block text-[12px] text-signature hover:underline"
                >
                  게시글 보기
                </Link>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                className="shrink-0 text-[13px] text-red-600 hover:underline"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
