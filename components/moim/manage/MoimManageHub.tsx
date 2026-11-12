"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { moimApi, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimDetailDto } from "@/lib/moim/moim-api-types";
import { Sam } from "@/lib/ui/sam-component-classes";
import { MoimManageFrame, MoimManageForbidden, moimManageCardClass } from "./moim-manage-shared";

type HubEntry = {
  key: string;
  href: string;
  titleKey: MessageKey;
  descKey: MessageKey;
  count?: number | null;
  danger?: boolean;
};

/** 모임장 위임 화면 — 권한이 있거나, 모임장인데 경고 때문에 막힌 경우(이유를 보여 주기 위해) */
export function canOpenMoimTransfer(detail: MoimDetailDto): boolean {
  return detail.can.transfer_host || (detail.viewer.role === "host" && detail.status === "active" && detail.platformState === "warned");
}

/** P8 미접속 모임장 변경 요청 — 부모임장·운영진, 운영 중인 모임 (모임장 30일 미접속 판정은 서버) */
export function canRequestMoimHostChange(detail: MoimDetailDto): boolean {
  return (detail.viewer.role === "co_host" || detail.viewer.role === "staff") && detail.status === "active";
}

export function canOpenMoimMembers(detail: MoimDetailDto): boolean {
  const c = detail.can;
  return c.remove_member || c.ban_member || c.set_role || c.write_note;
}

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

  if (entries.length === 0) return <MoimManageForbidden moimId={id} />;

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
                <span className={`${Sam.badge.danger} shrink-0 whitespace-nowrap`}>{t("moim_manage_count_badge", { count: e.count })}</span>
              ) : null}
              <span aria-hidden className="shrink-0 text-sam-meta">
                ›
              </span>
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
