"use client";

import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { MemberBenefitCard } from "./MemberBenefitCard";

interface MemberBenefitListProps {
  policies: MemberBenefitPolicy[];
  emptyMessage?: string;
}

export function MemberBenefitList({
  policies,
  emptyMessage = "적용된 혜택이 없습니다.",
}: MemberBenefitListProps) {
  if (policies.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center text-[14px] text-sam-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {policies.map((p) => (
        <li key={p.id}>
          <MemberBenefitCard policy={p} />
        </li>
      ))}
    </ul>
  );
}
