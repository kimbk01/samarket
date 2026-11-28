// @vitest-environment jsdom
/**
 * 재감사(2026-11-28): 수정 중인 칸이 사라지면(답글 숨기기·목록에서 빠짐) 그 수정만 끝나야 입력 바가 돌아온다. 동작 시험.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ language: "ko", t: (k: string, v?: Record<string, string | number>) => String(translate("ko", k as MessageKey, v) ?? k) }),
}));
vi.mock("@/components/common/SamarketThumbnail", () => ({ SamarketThumbnail: () => <span /> }));

import { CommunityCommentItem } from "@/components/community/post-detail/CommunityCommentItem";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const node: NeighborhoodCommentNode = {
  id: "c1", post_id: "p", user_id: "u", parent_id: null, content: "x", created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(), is_edited: false, author_name: "A", author_avatar_url: null, is_post_author: false,
  is_pinned: false, like_count: 0, liked_by_viewer: false, display_state: "visible", children: [],
};

describe("CommunityCommentItem 수정 칸이 사라질 때", () => {
  it("수정 중이던 칸이 화면에서 빠지면 onEditingClose(그 id) 를 부른다", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onEditingClose = vi.fn();
    const props = {
      node, viewerUserId: "u", onLike: () => undefined, onEdit: async () => null, onOpenMenu: () => undefined,
      onReply: () => undefined, onEditingChange: () => undefined, onEditingClose, maxLength: 500, commentBusy: false,
    };
    await act(async () => root.render(<CommunityCommentItem {...props} editingCommentId="c1" />));
    expect(host.querySelector("form textarea")).not.toBeNull();
    expect(host.querySelector('[data-form-keyboard-keep-visible="1"]')?.textContent).toBe(translate("ko", "community_save"));
    expect(onEditingClose).not.toHaveBeenCalled();
    await act(async () => root.render(<div />));
    expect(onEditingClose).toHaveBeenCalledWith("c1");
  });
});
