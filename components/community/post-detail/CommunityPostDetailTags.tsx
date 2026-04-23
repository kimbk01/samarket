"use client";

import Link from "next/link";

type Props = {
  tags: string[];
};

export function CommunityPostDetailTags({ tags }: Props) {
  if (tags.length === 0) return null;

  return (
    <div className="px-4 pt-5">
      <p className="mb-2 text-[12px] font-normal text-[#6B7280]">추천 태그</p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {tags.map((t) => {
          const q = t.startsWith("#") ? t.slice(1) : t;
          const href = `/philife?tag=${encodeURIComponent(q)}`;
          return (
            <li key={t}>
              <Link
                href={href}
                className="text-[14px] font-semibold text-[#7360F2] hover:underline active:opacity-80"
              >
                {t.startsWith("#") ? t : `#${t}`}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
