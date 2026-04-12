"use client";

import Link from "next/link";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { MEMBER_TYPE_LABELS } from "@/lib/member-benefits/member-benefit-utils";

interface AdminMemberBenefitTableProps {
  policies: MemberBenefitPolicy[];
}

export function AdminMemberBenefitTable({
  policies,
}: AdminMemberBenefitTableProps) {
  if (policies.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        등록된 회원 혜택 정책이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              구분
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              제목
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              노출 우선
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              포인트/광고
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              수정일
            </th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">
                {MEMBER_TYPE_LABELS[p.memberType]}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/member-benefits/${p.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {p.title}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                홈 +{p.homePriorityBoost} / 검색 +{p.searchPriorityBoost} / 상점 +{p.shopFeaturedPriorityBoost}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                포인트 {(p.pointRewardBonusRate * 100).toFixed(0)}% / 광고 {(p.adDiscountRate * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    p.isActive
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-sam-border-soft text-sam-muted"
                  }`}
                >
                  {p.isActive ? "활성" : "비활성"}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                {new Date(p.updatedAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
