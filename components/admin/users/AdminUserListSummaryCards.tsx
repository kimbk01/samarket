"use client";

import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import {
  memberListSummaryChipLabelKo,
  type MemberListSummaryChipId,
} from "@/lib/admin-users/member-list-presentation";
import type {
  AdminMemberPrivilegeFilter,
  AdminMemberStoreFilter,
} from "@/lib/admin-users/admin-member-list-query";
import type { AdminUserStatusCategory } from "@/lib/types/admin-user";

export type MemberListSummary = {
  total: number | null;
  active: number | null;
  suspended: number | null;
  blocked: number | null;
  storeOps: number | null;
  admin: number | null;
};

type Props = {
  summary: MemberListSummary;
  activeStatus: AdminUserStatusCategory | "";
  activeStore: AdminMemberStoreFilter | "";
  activePrivilege: AdminMemberPrivilegeFilter | "";
  onSelect: (chip: MemberListSummaryChipId) => void;
};

const CHIPS: MemberListSummaryChipId[] = [
  "all",
  "active",
  "suspended",
  "blocked",
  "store_ops",
  "admin",
];

function countFor(chip: MemberListSummaryChipId, summary: MemberListSummary): number | null {
  switch (chip) {
    case "all":
      return summary.total;
    case "active":
      return summary.active;
    case "suspended":
      return summary.suspended;
    case "blocked":
      return summary.blocked;
    case "store_ops":
      return summary.storeOps;
    case "admin":
      return summary.admin;
  }
}

function isSelected(
  chip: MemberListSummaryChipId,
  activeStatus: AdminUserStatusCategory | "",
  activeStore: AdminMemberStoreFilter | "",
  activePrivilege: AdminMemberPrivilegeFilter | "",
): boolean {
  if (chip === "all") return !activeStatus && !activeStore && !activePrivilege;
  if (chip === "store_ops") return activeStore === "has_store";
  if (chip === "admin") return activePrivilege === "admin";
  return activeStatus === chip;
}

export function AdminUserListSummaryCards({
  summary,
  activeStatus,
  activeStore,
  activePrivilege,
  onSelect,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2" data-member-list-summary-chips="1">
      {CHIPS.map((chip) => {
        const selected = isSelected(chip, activeStatus, activeStore, activePrivilege);
        const count = countFor(chip, summary);
        const label = memberListSummaryChipLabelKo(chip);
        return (
          <button
            key={chip}
            type="button"
            onClick={() => onSelect(chip)}
            className={
              selected
                ? "inline-flex items-center gap-1.5 rounded-full border border-[#2563eb] bg-[#eff6ff] px-3 py-1.5 text-[12px] font-semibold text-[#2563eb]"
                : "inline-flex items-center gap-1.5 rounded-full border border-[#e4e7ec] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#475467] hover:bg-[#f9fafb]"
            }
            aria-pressed={selected}
            data-member-list-summary-chip={chip}
          >
            <span>{label}</span>
            <span className={selected ? "text-[#2563eb]" : "text-[#98a2b3]"}>
              {count == null ? "—" : count.toLocaleString("ko-KR")}
            </span>
          </button>
        );
      })}
      <span className="sr-only">{MEMBER_ADMIN_COPY.member_management}</span>
    </div>
  );
}
