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
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sam-warning-soft text-[12px] font-black text-sam-fg">
        K
      </span>,
    );
  }
  if (provider === "google") {
    return wrap(
      "google",
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-sam-border bg-sam-surface text-[12px] font-black text-sam-info">
        G
      </span>,
    );
  }
  if (provider === "apple") {
    return wrap(
      "apple",
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sam-fg text-[12px] font-bold text-white">
        A
      </span>,
    );
  }
  if (provider === "email") {
    return wrap(
      "email",
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sam-info-soft text-sam-info">
        <Mail className="h-3 w-3" aria-hidden />
      </span>,
    );
  }
  if (provider === "manual") {
    return wrap(
      "manual",
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sam-surface-muted text-sam-muted">
        <FileText className="h-3 w-3" aria-hidden />
      </span>,
    );
  }
  return wrap(
    "unknown",
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sam-surface-muted text-[12px] font-bold text-sam-muted">
      ?
    </span>,
  );
}
