"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { moimApi, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimDetailDto } from "@/lib/moim/moim-api-types";
import { Sam } from "@/lib/ui/sam-component-classes";
import { moimCls } from "@/components/moim/moim-ui";
import {
  MoimManageFrame,
  MoimManageForbidden,
  canOpenMoimMembers,
  canOpenMoimTransfer,
  canRequestMoimHostChange,
  moimManageCardClass,
} from "./moim-manage-shared";

/** 권한 판정은 `moim-manage-shared` 하나 (R4 #17 뒤로 경로와 같은 조건) — 기존 가져오기 경로 유지 */
export { canOpenMoimMembers, canOpenMoimTransfer, canRequestMoimHostChange } from "./moim-manage-shared";

type HubEntry = {
  key: string;
  href: string;
  titleKey: MessageKey;
  descKey: MessageKey;
  count?: number | null;
  danger?: boolean;
};

function HubBody({ detail }: { detail: MoimDetailDto }) {
  const { t } = useI18n();
  const id = detail.id;
  const c = detail.can;
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  const loadPending = useCallback(async () => {
    if (!c.decide_join) return;
    const r = await moimApi.joinRequests(id);
    if (r.ok) setPendingCount(r.requests.length);
  }, [c.decide_join, id]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  const entries: HubEntry[] = [];
  if (c.decide_join)
    entries.push({ key: "requests", href: moimRoutes.manageRequests(id), titleKey: "moim_manage_requests_title", descKey: "moim_manage_hub_requests_desc", count: pendingCount });
  if (canOpenMoimMembers(detail))
    entries.push({ key: "members", href: moimRoutes.manageMembers(id), titleKey: "moim_manage_members_title", descKey: "moim_manage_hub_members_desc" });
  if (c.edit_info) {
    entries.push({ key: "permissions", href: moimRoutes.managePermissions(id), titleKey: "moim_manage_permissions_title", descKey: "moim_manage_hub_permissions_desc" });
    entries.push({ key: "info", href: moimRoutes.manageInfo(id), titleKey: "moim_manage_info_title", descKey: "moim_manage_hub_info_desc" });
  }
  if (c.manage_invite_link || c.send_invite)
    entries.push({ key: "invite", href: moimRoutes.manageInvite(id), titleKey: "moim_manage_invite_title", descKey: "moim_manage_hub_invite_desc" });
  if (c.manage_boards)
    entries.push({ key: "boards", href: moimRoutes.manageBoards(id), titleKey: "moim_manage_boards_title", descKey: "moim_manage_hub_boards_desc" });
  if (c.hide_post)
    entries.push({ key: "reports", href: moimRoutes.manageReports(id), titleKey: "moim_manage_reports_title", descKey: "moim_manage_hub_reports_desc" });
  if (canOpenMoimTransfer(detail))
    entries.push({ key: "transfer", href: moimRoutes.manageTransfer(id), titleKey: "moim_manage_transfer_title", descKey: "moim_manage_hub_transfer_desc" });
  if (canRequestMoimHostChange(detail))
    entries.push({ key: "host-request", href: moimRoutes.manageHostRequest(id), titleKey: "moim_manage_host_request_title", descKey: "moim_manage_hub_host_request_desc" });
  if (c.close)
    entries.push({ key: "close", href: moimRoutes.manageClose(id), titleKey: "moim_manage_close_title", descKey: "moim_manage_hub_close_desc", danger: true });

  if (entries.length === 0) return <MoimManageForbidden moimId={id} detail={detail} />;

  return (
    <div className="px-4 pt-4">
      <p className="mb-3 truncate text-[15px] font-semibold text-sam-fg">{detail.name}</p>
      <ul className={`${moimManageCardClass} divide-y divide-sam-border-soft`}>
        {entries.map((e) => (
          <li key={e.key}>
            <Link href={e.href} className={`${Sam.listRow.interactive} flex min-h-[56px] items-center gap-3 px-4 py-3`}>
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] font-medium ${e.danger ? "text-sam-danger" : "text-sam-fg"}`}>{t(e.titleKey)}</span>
                <span className="mt-0.5 block text-[13px] text-sam-muted">{t(e.descKey)}</span>
              </span>
              {e.count ? (
                <span className={`${moimCls.badge} ${moimCls.badgeGreen}`}>{t("moim_manage_count_badge", { count: e.count })}</span>
              ) : null}
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-sam-meta" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MoimManageHub({ moimId }: { moimId: string }) {
  return (
    <MoimManageFrame moimId={moimId} titleKey="moim_manage_hub_title" backHref={moimRoutes.home(moimId)} allow={() => true}>
      {({ detail }) => <HubBody detail={detail} />}
    </MoimManageFrame>
  );
}
