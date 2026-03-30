"use client";

import { DETAIL_SKINS, LIST_SKINS } from "@/lib/community-board/skin-registry";
import type {
  SkinType,
  BoardListSkinProps,
  BoardDetailSkinProps,
} from "@/lib/community-board/types";
import { BoardListCategoryChips } from "./BoardListCategoryChips";

/** 리스트 모드: skin_type에 따라 게시판 목록 스킨 렌더링 */
export function BoardSkinRendererList(props: BoardListSkinProps & { skinType: SkinType }) {
  const { skinType, showCategoryFilter, categorySlug, baseHref, filterBaseHref, boardCategories, ...rest } = props;
  const chipBaseHref = filterBaseHref ?? baseHref;
  const Skin = LIST_SKINS[skinType] ?? LIST_SKINS.basic;
  const showChips = showCategoryFilter && boardCategories && boardCategories.length > 0;
  return (
    <>
      {showChips ? (
        <BoardListCategoryChips baseHref={chipBaseHref} categorySlug={categorySlug} categories={boardCategories} />
      ) : null}
      <Skin
        {...rest}
        board={props.board}
        posts={props.posts}
        baseHref={baseHref}
        showCategoryFilter={showCategoryFilter}
        categorySlug={categorySlug}
        boardCategories={boardCategories}
      />
    </>
  );
}

/** 상세 모드: skin_type에 따라 글 상세 스킨 렌더링 */
export function BoardSkinRendererDetail(props: BoardDetailSkinProps & { skinType: SkinType }) {
  const { skinType, ...rest } = props;
  const Skin = DETAIL_SKINS[skinType] ?? DETAIL_SKINS.basic;
  return <Skin {...rest} />;
}

/**
 * 게시판 스킨 단일 진입점 (mode로 리스트/상세 분기)
 * - mode="list" → BoardListSkinProps + skinType
 * - mode="detail" → BoardDetailSkinProps + skinType
 */
export function BoardSkinRenderer(
  props:
    | (BoardListSkinProps & { mode: "list"; skinType: SkinType })
    | (BoardDetailSkinProps & { mode: "detail"; skinType: SkinType })
) {
  if (props.mode === "list") {
    const { mode: _m, skinType, ...rest } = props;
    return <BoardSkinRendererList skinType={skinType} {...rest} />;
  }
  const { mode: _m, skinType, ...rest } = props;
  return <BoardSkinRendererDetail skinType={skinType} {...rest} />;
}
