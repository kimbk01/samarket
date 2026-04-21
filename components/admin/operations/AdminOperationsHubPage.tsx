"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";

const LINKS: { href: string; label: string; desc: string }[] = [
  { href: "/admin/chats", label: "채팅 관리", desc: "거래·커뮤니티·비즈 등 방 목록 및 상세 조치" },
  { href: "/admin/reports", label: "신고", desc: "채팅·게시글 신고 검토" },
  { href: "/admin/community/posts", label: "게시글", desc: "커뮤니티 콘텐츠 점검" },
  { href: "/admin/comments", label: "댓글", desc: "댓글 문의·악성 댓글 대응" },
  { href: "/admin/users", label: "회원", desc: "계정·제재 연계" },
];

export function AdminOperationsHubPage() {
  return (
    <div className="space-y-4">
      <AdminPageHeader title="운영 허브" backHref="/admin" />
      <AdminCard title="빠른 이동">
        <ul className="space-y-3 sam-text-body">
          {LINKS.map((x) => (
            <li key={x.href} className="border-b border-sam-border-soft pb-3 last:border-0 last:pb-0">
              <Link href={x.href} className="font-medium text-signature hover:underline">
                {x.label}
              </Link>
              <p className="mt-0.5 sam-text-body-secondary text-sam-muted">{x.desc}</p>
            </li>
          ))}
        </ul>
      </AdminCard>
      <AdminCard title="채팅 조치 (백엔드)">
        <p className="sam-text-body-secondary leading-relaxed text-sam-muted">
          관리자 채팅 상세의 버튼은{" "}
          <code className="rounded bg-sam-surface-muted px-1 sam-text-helper">POST /api/admin/chat/rooms/[id]/action</code>
          으로 처리됩니다. <code className="rounded bg-sam-surface-muted px-1 sam-text-helper">product_chats</code> ID로
          열어도 연결된 <code className="rounded bg-sam-surface-muted px-1 sam-text-helper">chat_rooms</code>에 동일하게
          반영됩니다.
        </p>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
          읽기 전용·관련 컬럼 오류 시 Supabase에 일반채팅 확장 마이그레이션(
          <code className="rounded bg-sam-surface-muted px-1 sam-text-helper">is_readonly</code>,{" "}
          <code className="rounded bg-sam-surface-muted px-1 sam-text-helper">related_*</code>) 적용 여부를 확인하세요.
        </p>
      </AdminCard>
    </div>
  );
}
