"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  listSelectableSupportCategories,
  type SupportAudience,
} from "@/lib/support/support-category-registry";
import {
  buildMemberSupportContext,
  buildOwnerSupportContext,
  type MemberSupportCategory,
  type OwnerSupportCategory,
} from "@/lib/support/support-context";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";

/**
 * PHASE 3-A generic hub gate: user must pick a registry category before open.
 * Explicit OTHER is allowed only when the user taps 기타.
 * Not full triage/guidance UI.
 */
export function SupportGenericHubInquireGate({
  audience,
  sourceSurface,
  storeId,
  className,
  buttonClassName,
  inquireDataAttr,
}: {
  audience: SupportAudience;
  sourceSurface: string;
  storeId?: string;
  className?: string;
  buttonClassName: string;
  /** data-support-hub-inquire | data-owner-support-inquire */
  inquireDataAttr: "data-support-hub-inquire" | "data-owner-support-inquire";
}) {
  const { safeT } = useI18n();
  const [open, setOpen] = useState(false);
  const categories = useMemo(
    () => listSelectableSupportCategories(audience),
    [audience]
  );

  const startWith = (categoryId: string) => {
    const explicitOther = categoryId === "OTHER";
    if (audience === "OWNER") {
      if (!storeId?.trim()) return;
      navigateToSupportCenter(
        buildOwnerSupportContext({
          enabled: true,
          category: categoryId as OwnerSupportCategory,
          sourceSurface,
          storeId,
          ...(explicitOther ? { explicitOtherSelection: true } : {}),
        })
      );
    } else {
      navigateToSupportCenter(
        buildMemberSupportContext({
          enabled: true,
          category: categoryId as MemberSupportCategory,
          sourceSurface,
          ...(explicitOther ? { explicitOtherSelection: true } : {}),
        })
      );
    }
    setOpen(false);
  };

  const inquireProps =
    inquireDataAttr === "data-support-hub-inquire"
      ? { "data-support-hub-inquire": "1" as const }
      : { "data-owner-support-inquire": "1" as const };

  return (
    <div className={className}>
      <button
        type="button"
        className={buttonClassName}
        {...inquireProps}
        onClick={() => setOpen((v) => !v)}
      >
        {safeT("support_enter_cta", {
          fallbackKo: "문의하기",
          fallbackEn: "Contact us",
        })}
      </button>
      {open ? (
        <div
          className="mt-2 rounded-ui-rect border border-sam-border bg-sam-surface p-2"
          data-support-generic-hub-category-gate="1"
        >
          <p className="mb-2 px-1 text-xs text-sam-muted">
            {safeT("support_hub_choose_category", {
              fallbackKo: "문의 유형을 선택해 주세요.",
              fallbackEn: "Choose a support category.",
            })}
          </p>
          <ul className="grid max-h-56 gap-1 overflow-y-auto">
            {categories.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full rounded-ui-rect px-3 py-2 text-left text-sm text-sam-fg hover:bg-sam-app"
                  data-support-hub-category={c.id}
                  onClick={() => startWith(c.id)}
                >
                  {safeT(c.labelKey as MessageKey, {
                    fallbackKo: "문의 유형",
                    fallbackEn: "Support category",
                  })}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
