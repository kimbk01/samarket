"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getAdminPosts } from "@/lib/admin-posts/getAdminPosts";
import { updatePostStatusAdmin } from "@/lib/admin-posts/updatePostAdmin";
import type { PostWithMeta } from "@/lib/posts/schema";
import { formatTimeAgo } from "@/lib/utils/format";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

const STATUS_OPTIONS: { value: PostWithMeta["status"]; label: string }[] = [
  { value: "active", label: "판매중" },
  { value: "reserved", label: "예약중" },
  { value: "sold", label: "거래완료" },
  { value: "hidden", label: "숨김" },
];

export function AdminPostsPageContent() {
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getAdminPosts();
    setPosts(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = useCallback(
    async (postId: string, status: PostWithMeta["status"]) => {
      const res = await updatePostStatusAdmin(postId, status);
      if (res.ok) load();
    },
    [load]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader title="게시글 목록" />
      {loading ? (
        <div className="py-12 text-center text-[14px] text-gray-500">불러오는 중…</div>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          게시글이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="p-3 font-medium text-gray-700">제목</th>
                <th className="p-3 font-medium text-gray-700">타입</th>
                <th className="p-3 font-medium text-gray-700">상태</th>
                <th className="p-3 font-medium text-gray-700">등록일</th>
                <th className="p-3 font-medium text-gray-700">관리</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="p-3">
                    <Link href={`/post/${p.id}`} className="text-signature hover:underline">
                      {p.title}
                    </Link>
                  </td>
                  <td className="p-3 text-gray-600">{p.type}</td>
                  <td className="p-3">
                    <select
                      value={p.status}
                      onChange={(e) =>
                        handleStatusChange(p.id, e.target.value as PostWithMeta["status"])
                      }
                      className="rounded border border-gray-300 px-2 py-1 text-[13px]"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 text-gray-500">{formatTimeAgo(p.created_at)}</td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(p.id, "hidden")}
                      className="text-[13px] text-red-600 hover:underline"
                    >
                      숨김
                    </button>
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
