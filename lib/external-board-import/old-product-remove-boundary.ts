/**
 * COMPLETE REMOVE boundary for old external import / crawler.
 * Execution is a later Owner-gated phase — not part of this implementation cut.
 *
 * Preserve: community_posts, comments, reactions, views, /philife, Detail.
 * Before DROP: inventory origin_kind=imported rows; never delete Community user data.
 */

export const OLD_EXTERNAL_IMPORT_COMPLETE_REMOVE = {
  phase: "DEFERRED_OWNER_GATE" as const,
  deleteNow: false,
  inScopePaths: [
    "lib/community-board-import/**",
    "lib/community-crawler/**",
    "app/api/admin/community/board-import/**",
    "app/api/admin/community/crawl/**",
    "components/admin/community/AdminCommunityCrawl*.tsx",
    "components/admin/community/AdminCommunityBoardImportPage.tsx",
    "board_import_* tables/RPCs",
    "community_crawl_* tables",
  ],
  provenanceSafetyRequired: true,
  neverDeleteCommunityUserData: true,
} as const;
