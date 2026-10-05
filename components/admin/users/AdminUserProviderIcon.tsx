"use client";

import { FileText, Mail } from "lucide-react";
import type { AdminAuthProvider } from "@/lib/types/admin-user";

export function AdminUserProviderIcon({ provider }: { provider: AdminAuthProvider }) {
  const wrap = (value: string, node: React.ReactNode) => (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
      data-member-provider-icon={value}
    >
      {node}
    </span>
  );

  if (provider === "kakao") {
    return wrap(
      "kakao",
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FEE500] text-[10px] font-black text-[#3c1e1e]">
        K
      </span>,
    );
  }
  if (provider === "google") {
    return wrap(
      "google",
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#d0d5dd] bg-white text-[10px] font-black text-[#4285F4]">
        G
      </span>,
    );
  }
  if (provider === "apple") {
    return wrap(
      "apple",
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#101828] text-[10px] font-bold text-white">
        A
      </span>,
    );
  }
  if (provider === "email") {
    return wrap(
      "email",
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb]">
        <Mail className="h-3 w-3" aria-hidden />
      </span>,
    );
  }
  if (provider === "manual") {
    return wrap(
      "manual",
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7] text-[#475467]">
        <FileText className="h-3 w-3" aria-hidden />
      </span>,
    );
  }
  return wrap(
    "unknown",
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7] text-[10px] font-bold text-[#667085]">
      ?
    </span>,
  );
}
