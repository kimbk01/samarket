import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createPost } from "@/lib/community-board/api";

const root = join(process.cwd());

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsx(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

describe("community-board product isolation", () => {
  it("createPost refuses new posts-table Community rows", async () => {
    await expect(
      createPost(
        {
          board_id: "x",
          title: "t",
          content: "c",
        } as never,
        "user-1",
      ),
    ).rejects.toThrow("legacy_community_board_writer_isolated");
  });

  it("submitCommunityPost redirects to canonical /philife/write without createPost", () => {
    const src = readFileSync(join(root, "lib/community-board/submit-community-post.ts"), "utf8");
    expect(src).toContain("getCanonicalCommunityWriteHref");
    expect(src).toContain("redirect(");
    expect(src).not.toMatch(/\bawait\s+createPost\b|\bcreatePost\s*\(/);
    expect(src).not.toContain('from "@/lib/community-board/api"');
  });

  it("no app route mounts orphaned community-board page components", () => {
    const appFiles = walkTsx(join(root, "app"));
    const boardPkg = ["@", "/components/community-board"].join("");
    const boardPkgSlash = `${boardPkg}/`;
    const banned = [boardPkg, boardPkgSlash, "CommunityBoardPage", "CommunityPostViewPage"];
    for (const file of appFiles) {
      const src = readFileSync(file, "utf8");
      // /community/write page name is fine — must not import board write component
      if (file.endsWith(`${join("community", "write", "page.tsx")}`)) {
        expect(src).toContain('redirect("/philife/write")');
        expect(src).not.toContain(boardPkg);
        continue;
      }
      for (const token of banned) {
        expect(src, `${file} must not reference ${token}`).not.toContain(token);
      }
    }
  });

  it("/community entry stays CommunityHomeSurface (not board skins)", () => {
    const page = readFileSync(join(root, "app/(main)/community/page.tsx"), "utf8");
    expect(page).toContain("CommunityHomeSurface");
    expect(page).not.toContain("CommunityBoardPage");
    expect(page).not.toContain("@/lib/community-board");
  });
});
