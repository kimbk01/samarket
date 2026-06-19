"use client";

import Image from "next/image";
import Link from "next/link";
import { philifeAppPaths } from "@domain/philife/paths";
import type { CommunityFeedPostDTO } from "@/lib/community-feed/types";
import type { PublicSellerProfileDTO } from "@/lib/users/map-profile-to-public-seller";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveCommunityTopicUILabel } from "@/lib/i18n/community-topic-label-i18n";

export function PublicUserProfileView({
  profile,
  communityPosts = [],
}: {
  profile: PublicSellerProfileDTO & { tradeLocationLine?: string | null };
  communityPosts?: CommunityFeedPostDTO[];
}) {
  const { t, language } = useI18n();

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex items-start gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-sam-surface-muted">
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="64px" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="sam-text-page-title font-semibold text-sam-fg">{profile.nickname ?? t("profile_no_nickname")}</p>
            {profile.tradeLocationLine ? (
              <p className="mt-1 sam-text-body-secondary text-sam-muted">{profile.tradeLocationLine}</p>
            ) : null}
          </div>
        </div>
      </div>

      <section className="mt-4 rounded-ui-rect border border-sam-border bg-sam-surface">
        <h2 className="border-b border-sam-border px-4 py-3 sam-text-body font-semibold text-sam-fg">
          {t("public_profile_community_posts_title")}
        </h2>
        {communityPosts.length === 0 ? (
          <p className="px-4 py-8 text-center sam-text-helper text-sam-muted">
            {t("public_profile_community_posts_empty")}
          </p>
        ) : (
          <ul className="divide-y divide-sam-border">
            {communityPosts.map((post) => (
              <li key={post.id}>
                <Link href={philifeAppPaths.post(post.id)} className="block px-4 py-3 hover:bg-sam-app">
                  <p className="sam-text-body font-semibold text-sam-fg">{post.title}</p>
                  <p className="mt-1 sam-text-helper text-sam-muted">
                    {resolveCommunityTopicUILabel(
                      language,
                      post.topic_name ?? "",
                      post.topic_name_en,
                      post.topic_slug
                    )}{" "}
                    · {post.region_label || t("mypage_comp_community_region_none")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
