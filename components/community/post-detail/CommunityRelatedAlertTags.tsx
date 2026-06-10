"use client";

import { getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { addInterestTagLocal } from "./post-detail-utils";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";

type Props = { tags: string[] };

export function CommunityRelatedAlertTags({ tags }: Props) {
  const { t } = useI18n();
  const requireAction = useRequireAuthAction();
  const me = getHydrationSafeCurrentUser();

  if (tags.length === 0) return null;

  return (
    <section className="mt-1 border-t border-[#E5E7EB] bg-[#F7F8FA]">
      <div className="px-4 py-5">
        <p className="m-0 text-[17px] font-bold leading-[1.35] text-[#1F2430]">{t("community_related_tags_prompt")}</p>
        <p className="mt-1 text-[13px] font-normal leading-[1.45] text-[#6B7280]">{t("community_related_tags_hint")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.slice(0, 6).map((t) => {
            const label = t.startsWith("#") ? t : `#${t}`;
            return (
              <button
                key={t}
                type="button"
                className="inline-flex min-h-9 items-center rounded-[4px] border border-[#E5E7EB] bg-white px-3 py-1.5 text-[11px] font-medium text-[#6B7280] active:bg-[#F3F4F6]"
                onClick={() => {
                  if (!me?.id) {
                    const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/philife";
                    void requireAction("community_bookmark", () => addInterestTagLocal(t), { next });
                    return;
                  }
                  addInterestTagLocal(t);
                }}
              >
                + {label.replace(/^#/, "")}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
