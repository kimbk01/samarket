"use client";

import Link from "next/link";

export function MyActivitySection() {
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[13px] font-medium text-gray-500">나의 활동</h2>
      <Link
        href="/mypage/community-posts"
        className="flex items-center gap-3 py-3 text-[14px] text-gray-800"
      >
        <span className="flex h-8 w-8 items-center justify-center text-gray-500">
          <PencilIcon />
        </span>
        <span className="flex-1">내 동네생활 글</span>
        <ChevronRight />
      </Link>
    </section>
  );
}

function PencilIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
