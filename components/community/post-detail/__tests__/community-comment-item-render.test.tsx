/**
 * 라운지 댓글 한 줄 — 표시는 서버 `display_state` 만 본다 (감사 L2·L5·L15 · 설계 §6.2·§6.5). 동작 시험(정적 렌더).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { NeighborhoodCommentNode } from "@/lib/neighborhood/types";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    language: "ko",
    t: (k: string, vars?: Record<string, string | number>) => String(translate("ko", k as MessageKey, vars) ?? k),
  }),
}));
vi.mock("@/components/common/SamarketThumbnail", () => ({
  SamarketThumbnail: () => <span data-avatar="" />,
}));

import { CommunityCommentItem } from "@/components/community/post-detail/CommunityCommentItem";

const ko = (k: MessageKey, vars?: Record<string, string | number>) => translate("ko", k, vars);

function node(over: Partial<NeighborhoodCommentNode> = {}): NeighborhoodCommentNode {
  return {
    id: "c1",
    post_id: "p1",
    user_id: "u1",
    parent_id: null,
    content: "SM 하이퍼마켓 추천해요",
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    updated_at: new Date(Date.now() - 3_600_000).toISOString(),
    is_edited: false,
    author_name: "민지",
    author_avatar_url: null,
    is_post_author: false,
    is_pinned: false,
    like_count: 0,
    liked_by_viewer: false,
    display_state: "visible",
    children: [],
    ...over,
  };
}

function render(n: NeighborhoodCommentNode) {
  return renderToStaticMarkup(
    <CommunityCommentItem
      node={n}
      viewerUserId="viewer"
      onLike={() => undefined}
      onEdit={async () => null}
      onOpenMenu={() => undefined}
      onReply={() => undefined}
      editingCommentId={null}
      onEditingChange={() => undefined}
      maxLength={500}
      commentBusy={false}
    />
  );
}

describe("CommunityCommentItem", () => {
  it("L2: 사용자가 삭제 문구와 같은 글을 써도 정상 댓글로 그린다(메뉴·공감·답글 있음)", () => {
    for (const text of ["댓글이 삭제 되었습니다.", ko("community_comment_deleted"), ko("community_comment_state_deleted_by_author")]) {
      const html = render(node({ content: text }));
      expect(html).toContain(text);
      expect(html).toContain('data-comment-state="visible"');
      expect(html).toContain(ko("community_comment_more_aria"));
      expect(html).toContain(ko("community_comment_reply"));
    }
  });

  it("자리 표시 4종 — 본문·이름·메뉴·버튼 없음", () => {
    const cases: Array<[NeighborhoodCommentNode["display_state"], MessageKey]> = [
      ["deleted_by_author", "community_comment_state_deleted_by_author"],
      ["removed_by_admin", "community_comment_state_removed"],
      ["blocked_author", "community_comment_state_blocked"],
      ["unavailable", "community_comment_state_unavailable"],
    ];
    for (const [state, key] of cases) {
      const html = render(node({ display_state: state, content: "", author_name: "", user_id: "" }));
      expect(html).toContain(ko(key));
      expect(html).not.toContain(ko("community_comment_more_aria"));
      expect(html).not.toContain(ko("community_comment_reply"));
      expect(html).not.toContain(ko("community_comment_like"));
    }
  });

  it("L5·L15: 「수정됨」은 작성자 수정(is_edited)일 때만, 작성자 배지·고정 표시", () => {
    expect(render(node())).not.toContain(ko("community_comment_edit_mark"));
    const html = render(node({ is_edited: true, is_post_author: true, is_pinned: true, like_count: 2 }));
    expect(html).toContain(`· ${ko("community_comment_edit_mark")}`);
    expect(html).toContain(ko("community_comment_author_badge"));
    expect(html).toContain(ko("community_comment_pinned_label"));
    expect(html).toContain(ko("community_stat_likes", { count: "2" }));
  });

  it("이름이 없으면 「익명」 — 회원 아이디 조각을 이름으로 쓰지 않는다 (L14)", () => {
    const html = render(node({ author_name: "" }));
    expect(html).toContain(ko("community_anonymous"));
  });

  it("답글 앞에 「@부모 이름」 · 답글이 있으면 「답글 N개 보기」로 접힘", () => {
    const parent = render(node({ children: [node({ id: "c2", parent_id: "c1", content: "주차 넓어요", author_name: "수아" })] }));
    expect(parent).toContain(ko("community_replies_expand", { count: 1 }));
    const reply = renderToStaticMarkup(
      <CommunityCommentItem
        node={node({ id: "c2", parent_id: "c1", content: "주차 넓어요", author_name: "수아" })}
        depth={1}
        parentAuthorName="민지"
        viewerUserId="viewer"
        onLike={() => undefined}
        onEdit={async () => null}
        onOpenMenu={() => undefined}
        onReply={() => undefined}
        editingCommentId={null}
        onEditingChange={() => undefined}
        maxLength={500}
        commentBusy={false}
      />
    );
    expect(reply).toContain("@민지");
  });
});
