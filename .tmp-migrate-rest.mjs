import fs from "node:fs";

const patches = [
  ["components/community/CommunityPostDetailClient.tsx", (s) => {
    if (!s.includes("useI18n")) {
      s = s.replace(
        '"use client";\n\nimport Link',
        '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\nimport Link'
      );
      s = s.replace(
        "export function CommunityPostDetailClient({",
        'export function CommunityPostDetailClient({'
      );
      s = s.replace(
        "}) {\n  const [mounted, setMounted]",
        "}) {\n  const { t } = useI18n();\n  const [mounted, setMounted]"
      );
    }
    return s
      .replace(">질문</span>", ">{t(\"community_badge_question\")}</span>")
      .replace("<span>조회 {viewCount}</span>", "<span>{t(\"community_stat_views\", { count: viewCount })}</span>")
      .replace("<span>댓글 {comments.length}</span>", "<span>{t(\"community_stat_comments\", { count: comments.length })}</span>")
      .replace("<p>일시:", "<p>{t(\"community_meetup_datetime\")}")
      .replace("<p>장소:", "<p>{t(\"community_meetup_place\")}")
      .replace(">게시글 신고</p>", ">{t(\"community_report_post\")}</p>")
      .replace("신고 사유를 적어 주세요. 운영팀이 확인합니다.", "{t(\"community_report_intro\")}")
      .replace('placeholder="예: 스팸, 욕설, 사기 의심 등"', 'placeholder={t("community_report_placeholder")}')
      .replace("<h2 className=\"sam-text-body font-semibold text-sam-fg\">댓글 {comments.length}</h2>", "<h2 className=\"sam-text-body font-semibold text-sam-fg\">{t(\"community_comments_title\", { count: comments.length })}</h2>");
  }],
  ["components/community/MeetingCard.tsx", (s) => {
    if (!s.includes("useI18n")) {
      s = s.replace(
        '"use client";\n\n',
        '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n\n'
      );
      s = s.replace("export function MeetingCard(", "export function MeetingCard(");
      s = s.replace("}) {\n  const", "}) {\n  const { t } = useI18n();\n  const");
    }
    return s
      .replaceAll(">방장</dt>", ">{t(\"community_meeting_host\")}</dt>")
      .replaceAll(">일시</dt>", ">{t(\"community_meeting_when\")}</dt>")
      .replaceAll(">참여</dt>", ">{t(\"community_meeting_participants\")}</dt>")
      .replaceAll(">소개</dt>", ">{t(\"community_meeting_intro\")}</dt>")
      .replaceAll(">참여방식</dt>", ">{t(\"community_meeting_join_policy\")}</dt>")
      .replace("※ 모임 참여 후 상세 정보를 볼 수 있습니다", "{t(\"community_meeting_detail_after_join\")}")
      .replace(">모임</p>", ">{t(\"community_badge_meeting\")}</p>")
      .replace("<span className=\"font-medium\">일시</span>", "<span className=\"font-medium\">{t(\"community_meeting_when_inline\")}</span>");
  }],
  ["components/community/MeetingJoinRequestModal.tsx", (s) => {
    if (!s.includes("useI18n")) {
      s = s.replace(
        '"use client";\n\nimport { useEffect',
        '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\nimport { useEffect'
      );
      s = s.replace(
        "}) {\n  const [nickname, setNickname]",
        "}) {\n  const { t } = useI18n();\n  const [nickname, setNickname]"
      );
    }
    return s
      .replace('aria-label="닫기"', 'aria-label={t("common_close")}')
      .replace(">모임 참여 요청</h2>", ">{t(\"community_join_request_title\")}</h2>")
      .replace(">닫기</button>", ">{t(\"common_close\")}</button>")
      .replace("모임장에게 전달됩니다. 승인 후 모임 참여 상태가 갱신됩니다.", "{t(\"community_join_request_intro\")}")
      .replace('label="이름"', 'label={t("community_join_field_name")}')
      .replace('hint="운영자가 확인할 수 있는 이름을 적어 주세요."', 'hint={t("community_join_field_name_hint")}')
      .replace('placeholder="예: BK"', 'placeholder={t("community_join_field_bk_placeholder")}')
      .replace('label="소개"', 'label={t("community_join_field_intro")}')
      .replace('placeholder="예: BGC 거주 / 운동 좋아함"', 'placeholder={t("community_join_field_area_placeholder")}')
      .replace('label="참여 이유"', 'label={t("community_join_field_reason")}')
      .replace('placeholder="예: 주말 축구 같이 하고 싶어요"', 'placeholder={t("community_join_field_message_placeholder")}')
      .replace('label="메모"', 'label={t("community_join_field_memo")}')
      .replace('placeholder="예: 처음 참여입니다"', 'placeholder={t("community_join_field_note_placeholder")}')
      .replace('label="입장 비밀번호"', 'label={t("community_join_field_room_password")}')
      .replace('placeholder="비밀번호"', 'placeholder={t("community_password_label")}')
      .replace(">취소</button>", ">{t(\"common_cancel\")}</button>")
      .replace('{busy ? "전송 중…" : "신청 보내기"}', '{busy ? t("community_join_request_submitting") : t("community_join_request_send")}');
  }],
  ["components/community/post-detail/CommunityCommentComposerForm.tsx", (s) => {
    if (!s.includes("useI18n")) {
      s = s.replace('"use client";\n\n', '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n\n');
      s = s.replace("export function CommunityCommentComposerForm", "export function CommunityCommentComposerForm");
      s = s.replace("}) {\n  const", "}) {\n  const { t } = useI18n();\n  const");
    }
    return s
      .replace('title="답글"', 'title={t("community_reply_title")}')
      .replace('aria-label="댓글 등록"', 'aria-label={t("community_comment_post_aria")}');
  }],
  ["components/community/post-detail/CommunityCommentItem.tsx", (s) => {
    if (!s.includes("useI18n")) {
      s = s.replace('"use client";\n\n', '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n\n');
      s = s.replace("export function CommunityCommentItem", "export function CommunityCommentItem");
      s = s.replace("}) {\n  const", "}) {\n  const { t } = useI18n();\n  const");
    }
    return s
      .replace(" · 수정", '{t("community_comment_edit_mark")}')
      .replace('aria-label="댓글 삭제"', 'aria-label={t("community_comment_delete_aria")}')
      .replace('aria-label="댓글 링크 복사"', 'aria-label={t("community_comment_copy_aria")}')
      .replace('title="추가 기능은 준비 중이에요"', 'title={t("community_comment_more_prep")}')
      .replace('placeholder="답글을 입력하세요…"', 'placeholder={t("community_reply_placeholder")}')
      .replace('{isReplyOpen ? "답글 취소" : "답글 쓰기"}', '{isReplyOpen ? t("community_reply_cancel") : t("community_reply_write")}');
  }],
  ["components/community/post-detail/CommunityCommentSection.tsx", (s) => {
    if (!s.includes("useI18n")) {
      s = s.replace('"use client";\n\n', '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n\n');
      s = s.replace("export function CommunityCommentSection", "export function CommunityCommentSection");
      s = s.replace("}) {\n  const", "}) {\n  const { t } = useI18n();\n  const");
    }
    return s
      .replace(">댓글</h2>", ">{t(\"community_stat_comments_title\")}</h2>")
      .replace('"댓글을 작성할 수 없어요."', 't("community_comment_locked")')
      .replace(">댓글 목록</p>", ">{t(\"community_comments_list_aria\")}</p>")
      .replace('aria-label="댓글 정렬"', 'aria-label={t("community_comments_sort_aria")}')
      .replace(">댓글 불러오는 중…</motion.div>", ">{t(\"community_comments_loading\")}</div>")
      .replace(">댓글 불러오는 중…</div>", ">{t(\"community_comments_loading\")}</motion.div>")
      .replace(">첫 댓글을 남겨 보세요.</p>", ">{t(\"community_comment_first\")}</p>");
  }],
  ["components/community/post-detail/CommunityInlineAdCard.tsx", (s) => {
    if (!s.includes("useI18n")) {
      s = s.replace('"use client";\n\n', '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n\n');
      s = s.replace("export function CommunityInlineAdCard", "export function CommunityInlineAdCard");
      s = s.replace("}) {\n  const", "}) {\n  const { t } = useI18n();\n  const");
    }
    return s.replace(">광고</span>", ">{t(\"community_ad_badge\")}</span>");
  }],
  ["components/community/post-detail/CommunityPostCategoryRow.tsx", (s) => {
    if (!s.includes("useI18n")) {
      s = s.replace('"use client";\n\n', '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n\n');
      s = s.replace("export function CommunityPostCategoryRow", "export function CommunityPostCategoryRow");
      s = s.replace("}) {\n  return", "}) {\n  const { t } = useI18n();\n  return");
    }
    return s.replace("· 질문", '{t("community_post_category_question")}');
  }],
  ["components/community/post-detail/CommunityPostDetailAuthorRow.tsx", (s) => {
    if (!s.includes("useI18n")) {
      s = s.replace('"use client";\n\n', '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n\n');
      s = s.replace("export function CommunityPostDetailAuthorRow", "export function CommunityPostDetailAuthorRow");
      s = s.replace("}) {\n  return", "}) {\n  const { t } = useI18n();\n  return");
    }
    return s.replace('"익명"', 't("community_anonymous")');
  }],
  ["components/community/CommunityDetail.tsx", (s) => {
    if (!s.includes("useI18n")) {
      s = s.replace('"use client";\n\n', '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n\n');
      s = s.replace("export function CommunityDetail(", "export function CommunityDetail(");
      s = s.replace("}) {\n  const router", "}) {\n  const { t } = useI18n();\n  const router");
    }
    return s
      .replace('window.confirm("이 댓글을 삭제할까요?")', 'window.confirm(t("community_confirm_delete_comment"))')
      .replace('window.confirm("이 글을 삭제할까요? (복구 불가)")', 'window.confirm(t("community_confirm_delete_post"))')
      .replace(">내 게시글 광고</p>", ">{t(\"community_my_post_ads\")}</p>")
      .replace('aria-label="닫기"', 'aria-label={t("common_close")}')
      .replace(">게시글 신고</p>", ">{t(\"community_report_post\")}</p>")
      .replace("공감 {likeCount}", "{t(\"community_stat_likes\", { count: likeCount })}")
      .replace(">문의</", ">{t(\"community_inquiry\")}</")
      .replace(">신고</", ">{t(\"community_report\")}</")
      .replace(">목록</", ">{t(\"community_list\")}</")
      .replace(">삭제</", ">{t(\"community_delete\")}</")
      .replace("로그인 후 모임에 참여하면 댓글을 작성할 수 있어요.", "{t(\"community_login_meeting_for_comments\")}")
      .replace("모임 참여 후 댓글을 작성할 수 있어요.", "{t(\"community_join_meeting_for_comments\")}")
      .replace('placeholder: "댓글을 남겨보세요…"', 'placeholder: t("community_comment_placeholder_detail")')
      .replace(">취소</", ">{t(\"common_cancel\")}</")
      .replace(">접수</", ">{t(\"community_receive\")}</")
      .replace('"삭제에 실패했습니다."', 't("community_delete_failed")')
      .replace('tier1Title = meeting ? "모임"', 'tier1Title = meeting ? t("community_meeting_label")')
      .replace(': "커뮤니티"', ': t("community_community_label")')
      .replace('label={meeting ? "모임"', 'label={meeting ? t("community_meeting_label")');
  }],
];

for (const [rel, patch] of patches) {
  const fp = rel;
  let s = fs.readFileSync(fp, "utf8");
  const after = patch(s);
  fs.writeFileSync(fp, after);
  console.log("ok", rel);
}
