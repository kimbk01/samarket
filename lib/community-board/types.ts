/**
 * 커뮤니티 게시판 엔진 공통 타입
 * - Board: 게시판 설정 (skin_type, form_type, policy)
 * - PostListItem / PostDetail: 리스트·상세용 글
 * - 스킨/폼 모듈 props
 */

import type { ComponentType } from "react";

export const SKIN_TYPES = ["basic", "gallery", "magazine", "qna", "promo"] as const;
export type SkinType = (typeof SKIN_TYPES)[number];

/** UI용 폼 타입 (관리자 설정 라벨) */
export const FORM_TYPE_LABELS = [
  "community_form",
  "gallery_form",
  "question_form",
  "promo_form",
] as const;
export type FormTypeLabel = (typeof FORM_TYPE_LABELS)[number];

/** DB 저장용 form_type 값 */
export const FORM_TYPE_VALUES = ["basic", "gallery", "qna", "promo"] as const;
export type FormTypeValue = (typeof FORM_TYPE_VALUES)[number];

/** FormTypeLabel → FormTypeValue 매핑 */
export const FORM_LABEL_TO_VALUE: Record<FormTypeLabel, FormTypeValue> = {
  community_form: "basic",
  gallery_form: "gallery",
  question_form: "qna",
  promo_form: "promo",
};

export interface BoardPolicy {
  allow_comment?: boolean;
  allow_like?: boolean;
  allow_report?: boolean;
  use_notice?: boolean;
  allow_search?: boolean;
  default_sort?: string;
  list_style?: "list" | "card" | "thumbnail";
  /** 게시판 문의 채팅 상대(운영자) — uuid. 없으면 env NEXT_PUBLIC_COMMUNITY_BOARD_CONTACT_USER_ID 사용 */
  moderator_user_id?: string;
}

export interface Board {
  id: string;
  service_id: string;
  name: string;
  slug: string;
  description: string | null;
  skin_type: SkinType;
  form_type: FormTypeValue;
  category_mode: "none" | "trade_category" | "board_category";
  policy: BoardPolicy;
  is_active: boolean;
  sort_order: number;
}

export interface PostAuthor {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
}

export interface PostImage {
  id: string;
  url: string | null;
  storage_path: string;
  sort_order: number;
}

export interface BoardCategory {
  id: string;
  name: string;
  slug: string;
}

/** 동네생활 주제(community_topics) */
export interface CommunityTopicRef {
  id: string;
  slug: string;
  name: string;
}

export interface PostListItem {
  id: string;
  board_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  view_count: number;
  status: string;
  visibility: string;
  author?: PostAuthor | null;
  images?: PostImage[];
  board_category?: BoardCategory | null;
  /** 지역 커뮤니티 주제 */
  community_topic?: CommunityTopicRef | null;
  like_count?: number;
  comment_count?: number;
}

/** 풀 본문 등 상세 전용 필드 확장 시 여기에 추가 */
export type PostDetail = PostListItem;

export interface PostCreatePayload {
  title: string;
  content: string;
  board_id: string;
  board_category_id?: string | null;
  /** public.community_topics.id (scope=local) */
  community_topic_id?: string | null;
  images?: { storage_path: string; url?: string }[];
}

// --- 스킨 모듈 인터페이스 ---

export interface BoardListSkinProps {
  posts: PostListItem[];
  board: Board;
  baseHref: string;
  /** 목록 상단 필터 칩(주제·카테고리) 링크 베이스 — 없으면 baseHref */
  filterBaseHref?: string;
  showCategoryFilter?: boolean;
  categorySlug?: string | null;
  /** board_category 모드 — 목록 상단 칩 (?category=slug) */
  boardCategories?: { slug: string; name: string }[];
}

export interface BoardDetailSkinProps {
  post: PostDetail;
  board: Board;
  boardSlug: string;
  baseHref: string;
  showComments?: boolean;
  showLike?: boolean;
  showReport?: boolean;
}

export type BoardListSkinComponent = ComponentType<BoardListSkinProps>;
export type BoardDetailSkinComponent = ComponentType<BoardDetailSkinProps>;

// --- 폼 모듈 인터페이스 ---

export interface BoardWriteFormProps {
  board: Board;
  onSubmit: (payload: PostCreatePayload) => Promise<void>;
  cancelHref: string;
  defaultCategoryId?: string | null;
  /** board_category 모드 — 카테고리 선택 */
  boardCategories?: { id: string; slug: string; name: string }[];
  /** 글쓰기 주제 선택(동네생활) */
  communityTopics?: { id: string; name: string }[];
  isSubmitting?: boolean;
}

export type BoardWriteFormComponent = ComponentType<BoardWriteFormProps>;
