"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { ProductSeller } from "@/lib/types/product";
import type { UserTrustSummary } from "@/lib/types/review";
import { getMemberType } from "@/lib/admin-users/mock-admin-users";
import { MemberProfileFrame } from "@/components/member-benefits/MemberProfileFrame";
import { TrustSummaryCard } from "@/components/reviews/TrustSummaryCard";
import { UserBlockButton } from "@/components/reports/UserBlockButton";

interface ProductSellerCardProps {
  seller: ProductSeller;
  trustSummary?: UserTrustSummary | null;
  /** 11단계: 사용자 신고 시 호출 */
  onReportUser?: () => void;
}

export function ProductSellerCard({ seller, trustSummary, onReportUser }: ProductSellerCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displaySummary = trustSummary ?? (seller.mannerTemp != null
    ? {
        userId: seller.id,
        reviewCount: 0,
        averageRating: 0,
        mannerScore: seller.mannerTemp,
        positiveCount: 0,
        negativeCount: 0,
        summaryTags: [],
      }
    : null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  const memberType = getMemberType(seller.id);

  return (
    <MemberProfileFrame memberType={memberType} variant="full" className="rounded-ui-rect">
      <div className="flex items-center gap-3 rounded-ui-rect bg-white p-3">
        <Link href={`/users/${seller.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gray-200">
            {seller.avatar ? (
              <img src={seller.avatar} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-gray-900">{seller.nickname}</p>
            <p className="text-[12px] text-gray-500">{seller.location}</p>
          </div>
          {displaySummary && (
            <div className="shrink-0">
              <TrustSummaryCard summary={displaySummary} variant="compact" />
            </div>
          )}
        </Link>
      {(onReportUser !== undefined) && (
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setMenuOpen((v) => !v); }}
            className="rounded p-1.5 text-gray-500"
            aria-label="더보기"
          >
            <MoreIcon className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded-ui-rect border border-gray-200 bg-white py-1">
              {onReportUser && (
                <button
                  type="button"
                  onClick={() => { onReportUser(); setMenuOpen(false); }}
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-700"
                >
                  신고
                </button>
              )}
              <div className="px-4 py-2">
                <UserBlockButton
                  userId={seller.id}
                  nickname={seller.nickname}
                  onBlockChange={() => setMenuOpen(false)}
                  variant="text"
                />
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </MemberProfileFrame>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}
