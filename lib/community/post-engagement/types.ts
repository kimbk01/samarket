/** 게시글 상세·목록 공통 viewer 상태 */
export type CommunityPostViewerState = {
  liked_by_viewer: boolean;
  saved_by_viewer: boolean;
  hidden_by_viewer: boolean;
  following_author: boolean;
  blocked_author: boolean;
  reported_by_viewer: boolean;
};

export const EMPTY_COMMUNITY_POST_VIEWER_STATE: CommunityPostViewerState = {
  liked_by_viewer: false,
  saved_by_viewer: false,
  hidden_by_viewer: false,
  following_author: false,
  blocked_author: false,
  reported_by_viewer: false,
};
