"use client";

import Link from "next/link";

/** 레거시 경로용 — 실제 목록은 `/chats` 사용 */
export function ChatContent() {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-6 text-center">
      <p className="text-[14px] text-gray-600">
        채팅 목록은 <strong className="font-medium text-gray-900">채팅</strong> 탭에서
        확인할 수 있습니다.
      </p>
      <Link
        href="/chats"
        className="mt-4 inline-block text-[14px] font-medium text-signature"
      >
        채팅으로 이동
      </Link>
    </div>
  );
}
