import { describe, expect, it } from "vitest";
import {
  COMMUNITY_IMPORTED_AUTHOR_FALLBACK,
  communityPostAllowsMemberPeerCta,
  isCommunityImportedOrigin,
  normalizeCommunityPostOriginKind,
} from "@/lib/community/community-post-origin";
import {
  resolveCommunityAuthor,
  resolveCommunityAuthorForFeedRow,
} from "@/lib/community/resolve-community-author";

describe("community post origin / author resolver STEP1", () => {
  it("T1 member uses profile nickname", () => {
    const a = resolveCommunityAuthorForFeedRow(
      {
        origin_kind: "member",
        user_id: "user-aaa-bbbb-cccc",
        profile_display_name: "이웃닉",
        profile_avatar_url: "https://cdn.example/a.png",
      },
      (id) => id.slice(0, 8)
    );
    expect(a.origin_kind).toBe("member");
    expect(a.display_name).toBe("이웃닉");
    expect(a.avatar_url).toBe("https://cdn.example/a.png");
    expect(a.member_peer_user_id).toBe("user-aaa-bbbb-cccc");
  });

  it("T2 imported uses display_author_name", () => {
    const a = resolveCommunityAuthor({
      origin_kind: "imported",
      user_id: "system-principal-uuid",
      display_author_name: "마닐라뉴스",
      display_author_avatar_url: "https://cdn.example/imp.png",
      profile_display_name: "Community Import",
      profile_avatar_url: "https://cdn.example/system.png",
    });
    expect(a.display_name).toBe("마닐라뉴스");
    expect(a.avatar_url).toBe("https://cdn.example/imp.png");
    expect(a.member_peer_user_id).toBeNull();
  });

  it("T3 imported never leaks system principal nickname or user_id slice", () => {
    const a = resolveCommunityAuthor({
      origin_kind: "imported",
      user_id: "abcdef12-3456-7890",
      display_author_name: "",
      profile_display_name: "IMPORT_BOT_INTERNAL",
      profile_avatar_url: "https://cdn.example/bot.png",
    });
    expect(a.display_name).toBe(COMMUNITY_IMPORTED_AUTHOR_FALLBACK);
    expect(a.display_name).not.toContain("IMPORT_BOT");
    expect(a.display_name).not.toBe("abcdef12");
    expect(a.avatar_url).toBeNull();
    expect(a.member_peer_user_id).toBeNull();
  });

  it("member missing nickname keeps uid-slice fallback (not DIBAY)", () => {
    const a = resolveCommunityAuthorForFeedRow(
      {
        origin_kind: "member",
        user_id: "abcdef12-zzzz",
        profile_display_name: "",
      },
      (id) => (id ? id.slice(0, 8) : "익명")
    );
    expect(a.display_name).toBe("abcdef12");
    expect(a.display_name).not.toBe(COMMUNITY_IMPORTED_AUTHOR_FALLBACK);
  });

  it("T6 imported disables member-peer CTA", () => {
    expect(communityPostAllowsMemberPeerCta("imported")).toBe(false);
    expect(communityPostAllowsMemberPeerCta("member")).toBe(true);
    expect(communityPostAllowsMemberPeerCta(undefined)).toBe(true);
    expect(isCommunityImportedOrigin("imported")).toBe(true);
    expect(normalizeCommunityPostOriginKind("ADMIN")).toBe("admin");
  });
});

describe("STEP1 reward/notify call-graph evidence (static)", () => {
  it("T7 reward only wired from member create writers", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = process.cwd();
    const posts = fs.readFileSync(path.join(root, "app/api/community/posts/route.ts"), "utf8");
    const neigh = fs.readFileSync(path.join(root, "app/api/community/neighborhood-posts/route.ts"), "utf8");
    expect(posts).toContain("applyCommunityPointRewardOnPostWrite");
    expect(neigh).toContain("applyCommunityPointRewardOnPostWrite");
    // STEP2 registry/Admin may exist; still no crawler→community_posts insert writer.
    const crawlStore = fs.readFileSync(
      path.join(root, "lib/community-crawler/admin-crawl-store.ts"),
      "utf8"
    );
    expect(crawlStore).not.toContain("applyCommunityPointRewardOnPostWrite");
    expect(crawlStore).not.toContain('from("community_posts")');
  });

  it("T8 like/comment skip author notify for imported", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = process.cwd();
    const like = fs.readFileSync(path.join(root, "app/api/community/posts/[postId]/like/route.ts"), "utf8");
    const comments = fs.readFileSync(
      path.join(root, "app/api/community/posts/[postId]/comments/route.ts"),
      "utf8"
    );
    expect(like).toContain("isCommunityImportedOrigin");
    expect(like).toContain("!isCommunityImportedOrigin(gate.originKind)");
    expect(comments).toContain("importedAuthor ? \"\" : postAuthorId");
  });
});
