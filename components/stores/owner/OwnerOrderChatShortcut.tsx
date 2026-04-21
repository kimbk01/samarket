"use client";

import Link from "next/link";

export function OwnerOrderChatShortcut() {
  return (
    <Link
      href="/my/business/inquiries"
      className="flex shrink-0 items-center gap-1 rounded-full bg-signature/5 px-2.5 py-1 sam-text-xxs font-bold text-sam-fg ring-1 ring-sam-border"
    >
      문의함
    </Link>
  );
}
