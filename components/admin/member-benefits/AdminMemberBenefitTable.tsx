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
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        등록된 회원 혜택 정책이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              구분
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              제목
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              노출 우선
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              포인트/광고
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              수정일
            </th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 text-gray-700">
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
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                홈 +{p.homePriorityBoost} / 검색 +{p.searchPriorityBoost} / 상점 +{p.shopFeaturedPriorityBoost}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                포인트 {(p.pointRewardBonusRate * 100).toFixed(0)}% / 광고 {(p.adDiscountRate * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    p.isActive
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {p.isActive ? "활성" : "비활성"}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(p.updatedAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
