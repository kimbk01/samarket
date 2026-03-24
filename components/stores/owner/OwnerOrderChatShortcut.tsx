"use client";

import Link from "next/link";

export function OwnerOrderChatShortcut() {
  return (
    <Link
      href="/my/business/inquiries"
      className="flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-800 ring-1 ring-violet-200"
    >
      문의함
    </Link>
  );
}
