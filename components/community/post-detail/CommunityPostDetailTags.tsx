"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  tags: string[];
};

export function CommunityPostDetailTags({ tags }: Props) {
  const { t } = useI18n();
  if (tags.length === 0) return null;

  return (
    <div className="mt-4 border-t border-[var(--cm-border)] pt-4">
      <p className="mb-2 text-[12px] font-normal text-[var(--cm-text-muted)]">{t("community_recommended_tags")}</p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {tags.map((tag) => {
          const q = tag.startsWith("#") ? tag.slice(1) : tag;
          const href = `/philife?tag=${encodeURIComponent(q)}`;
          return (
            <li key={tag}>
              <Link
                href={href}
                className="inline-block rounded-full bg-[var(--cm-primary-soft)] px-3 py-1 text-[13px] font-semibold text-[var(--cm-primary)] hover:underline active:opacity-80"
              >
                {tag.startsWith("#") ? tag : `#${tag}`}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
