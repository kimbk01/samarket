"use client";

/**
 * ARO-IA-001 — contextual Domain ↔ Common cross-links with returnTo preservation.
 * Not a primary nav leaf; not SSOT migration.
 * Labels use language ternaries (same pattern as Delivery HOME/Ads cross-links)
 * to avoid enlarging MessageKey declaration emit (TS7056 under composite test tsc).
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/css-vars";
import {
  readAdminReturnToFromSearch,
  withAdminReturnTo,
} from "@/lib/admin/admin-operation-return-context";

export type AdminOpsCrossLinkItem = {
  href: string;
  labelKo: string;
  labelEn: string;
  /** data-* marker for targeted proof */
  dataAttr: string;
};

function currentAdminLocation(pathname: string, search: string): string {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  sp.delete("returnTo");
  const q = sp.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export function AdminOpsCrossLinkBar({
  links,
  noteKo,
  noteEn,
  "data-testid": testId = "admin-ops-cross-link-bar",
}: {
  links: readonly AdminOpsCrossLinkItem[];
  noteKo?: string;
  noteEn?: string;
  "data-testid"?: string;
}) {
  const { language } = useI18n();
  const ko = language === "ko";
  const pathname = usePathname() || "/admin";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const returnHere = currentAdminLocation(pathname, search);
  const inboundReturn = readAdminReturnToFromSearch(searchParams);

  if (!links.length && !inboundReturn) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface/60 px-3 py-2"
      data-admin-ops-cross-link-bar="1"
      data-testid={testId}
    >
      {inboundReturn ? (
        <Link
          href={inboundReturn}
          className={`${Sam.btn.secondary} text-[12px]`}
          data-admin-ops-return-link="1"
          prefetch={false}
        >
          {ko ? "이전 화면으로" : "Back to previous"}
        </Link>
      ) : null}
      {links.map((link) => (
        <Link
          key={link.href + link.dataAttr}
          href={withAdminReturnTo(link.href, returnHere)}
          className={`${Sam.btn.secondary} text-[12px]`}
          data-admin-ops-cross-link={link.dataAttr}
          prefetch={false}
        >
          {ko ? link.labelKo : link.labelEn}
        </Link>
      ))}
      {noteKo ? (
        <p className="w-full text-[11px] text-sam-muted" data-admin-ops-cross-link-note="1">
          {ko ? noteKo : noteEn || noteKo}
        </p>
      ) : null}
    </div>
  );
}
