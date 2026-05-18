/**
 * DIBAY i18n: write, write-launcher, community-board, delivery search, jobs detail, group-chat, home-feed
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const UI_FINISH_KO_BLOCK = `
    ui_write_err_content: "내용을 입력해 주세요.",
    ui_write_title_ph: "제목",
    ui_write_content_ph: "내용을 입력해 주세요",
    ui_write_photos_optional: "사진 (선택)",
    ui_write_photos_label: "사진",
    ui_write_title_label: "제목",
    ui_write_content_label: "내용",
    ui_write_feature_unsupported: "이 카테고리는 글쓰기를 지원하지 않습니다.",
    ui_write_feature_hint: "혜택·기능 페이지는 별도 안내를 확인해 주세요.",
    ui_write_back_to_category: "카테고리로 돌아가기",
    ui_write_service_request_label: "요청 내용",
    ui_write_service_request_err: "요청 내용을 입력해 주세요.",
    ui_write_service_contact_label: "연락 방법",
    ui_write_service_desc_label: "설명",
    ui_write_service_desc_err: "설명을 입력해 주세요.",
    ui_write_service_title_ph: "어떤 도움이 필요하신가요?",
    ui_write_service_contact_ph: "채팅, 전화 등",
    ui_write_service_content_ph: "서비스 내용을 입력해 주세요",
    ui_write_service_location_err:
      "거래 지역을 읽지 못했습니다. 주소 관리에서 대표 주소를 저장한 뒤 다시 시도해 주세요.",
    ui_write_service_request_submit: "요청하기",
    ui_write_image_rotate: "회전",
    ui_write_image_add_aria: "사진 추가",
    ui_write_phrase_ph: "문구를 입력하세요",
    ui_write_topic_label: "주제",
    ui_write_topic_one_only: "· 하나만",
    ui_write_topic_select_paren: "(하나만 선택)",
    ui_write_cancel_title: "글쓰기 취소",
    ui_write_discard_body: "입력한 내용이 저장되지 않습니다.",
    ui_write_continue_writing: "계속 쓰기",
    ui_write_cancel_confirm: "취소",
    ui_write_auth_checking: "권한 확인 중…",
    ui_write_unsupported_type: "지원하지 않는 카테고리 타입입니다.",
    ui_write_select_category: "카테고리를 선택하세요",
    ui_write_category_disabled_suffix: " (작성 불가)",
    ui_write_launcher_no_topics: "노출할 주제가 없습니다.",
    ui_write_launcher_admin_hint: "관리자 → 메뉴 관리에서 항목의 「런처 노출」을 켜 주세요.",
    ui_write_launcher_menu_aria: "글쓰기 메뉴",
    ui_write_zip_philpost_label: "ZIP 코드 (PhilPost 4자리)",
    ui_write_zip_philpost_aria: "PhilPost ZIP 4자리",
    ui_write_suffix_post: "글쓰기",
    ui_delivery_nav_aria: "배달 전용 메뉴",
    ui_delivery_search_back_aria: "뒤로가기",
    ui_delivery_search_input_ph: "먹고 싶은 메뉴나 가게를 찾아보세요",
    ui_delivery_search_input_aria: "배달 검색어 입력",
    ui_delivery_search_clear_aria: "검색어 지우기",
    ui_delivery_search_searching: "검색 중…",
    ui_delivery_search_no_results_title: "검색 결과가 없습니다",
    ui_delivery_search_no_results_hint: "다른 키워드로 다시 시도해 보세요.",
    ui_delivery_search_stores_heading: "가게",
    ui_delivery_search_stores_empty: "가게 결과가 없습니다.",
    ui_delivery_search_menu_heading: "메뉴",
    ui_delivery_search_menu_empty: "메뉴 결과가 없습니다.",
    ui_delivery_search_popular_heading: "인기 검색어",
    ui_delivery_search_popular_empty: "표시할 데이터가 없습니다.",
    ui_delivery_search_recent_heading: "최근 검색어",
    ui_delivery_search_recent_empty: "최근 검색어가 없습니다.",
    ui_delivery_search_recommended_heading: "추천 검색어",
    ui_group_chat_title: "그룹 채팅",
    ui_group_chat_intro:
      "새 방을 만들면 소유자로 입장합니다. 링크로 방 id를 알면 \`/group-chat/방id\` 로 바로 들어갈 수 있어요.",
    ui_group_chat_room_name_label: "방 이름 (선택)",
    ui_group_chat_room_name_ph: "예: 동호회 잡담",
    ui_group_chat_create_failed: "생성에 실패했습니다.",
    ui_group_chat_no_room_id: "응답에 방 id가 없습니다.",
    ui_group_chat_creating: "만드는 중…",
    ui_group_chat_create_room: "방 만들기",
    ui_group_chat_trade_list_link: "거래 채팅 목록",
    ui_group_chat_room_id_required: "roomId가 필요합니다.",
    ui_group_chat_room_not_found: "방을 찾을 수 없습니다.",
    ui_jobs_detail_recruit_section: "모집 정보",
    ui_jobs_detail_conditions_section: "근무 조건",
    ui_jobs_detail_description_heading: "상세 설명",
    ui_jobs_detail_seek_section: "구직 정보",
    ui_jobs_detail_intro_heading: "자기소개",
    ui_jobs_detail_extra_section: "추가 정보",
    ui_jobs_contact_chat_note: "연락은 채팅으로 주고받아요. 전화번호는 글에 표시되지 않습니다.",`;

const UI_FINISH_EN_BLOCK = `
    ui_write_err_content: "Please enter content.",
    ui_write_title_ph: "Title",
    ui_write_content_ph: "Enter your content",
    ui_write_photos_optional: "Photos (optional)",
    ui_write_photos_label: "Photos",
    ui_write_title_label: "Title",
    ui_write_content_label: "Content",
    ui_write_feature_unsupported: "Writing is not supported in this category.",
    ui_write_feature_hint: "See separate guidance for benefits and feature pages.",
    ui_write_back_to_category: "Back to category",
    ui_write_service_request_label: "Request details",
    ui_write_service_request_err: "Please describe your request.",
    ui_write_service_contact_label: "Contact method",
    ui_write_service_desc_label: "Description",
    ui_write_service_desc_err: "Please enter a description.",
    ui_write_service_title_ph: "What help do you need?",
    ui_write_service_contact_ph: "Chat, phone, etc.",
    ui_write_service_content_ph: "Describe the service",
    ui_write_service_location_err:
      "Could not read trade area. Save a primary address in address settings and try again.",
    ui_write_service_request_submit: "Submit request",
    ui_write_image_rotate: "Rotate",
    ui_write_image_add_aria: "Add photo",
    ui_write_phrase_ph: "Enter a phrase",
    ui_write_topic_label: "Topic",
    ui_write_topic_one_only: "· one only",
    ui_write_topic_select_paren: "(select one)",
    ui_write_cancel_title: "Cancel writing",
    ui_write_discard_body: "Your input will not be saved.",
    ui_write_continue_writing: "Keep writing",
    ui_write_cancel_confirm: "Leave",
    ui_write_auth_checking: "Checking access…",
    ui_write_unsupported_type: "Unsupported category type.",
    ui_write_select_category: "Select a category",
    ui_write_category_disabled_suffix: " (cannot post)",
    ui_write_launcher_no_topics: "No topics to show.",
    ui_write_launcher_admin_hint: "In Admin → Menu management, enable 「Show in launcher」 for items.",
    ui_write_launcher_menu_aria: "Write menu",
    ui_write_zip_philpost_label: "ZIP code (PhilPost 4 digits)",
    ui_write_zip_philpost_aria: "PhilPost ZIP 4 digits",
    ui_write_suffix_post: "Write",
    ui_delivery_nav_aria: "Delivery menu",
    ui_delivery_search_back_aria: "Go back",
    ui_delivery_search_input_ph: "Search for food or stores",
    ui_delivery_search_input_aria: "Delivery search query",
    ui_delivery_search_clear_aria: "Clear search",
    ui_delivery_search_searching: "Searching…",
    ui_delivery_search_no_results_title: "No results",
    ui_delivery_search_no_results_hint: "Try another keyword.",
    ui_delivery_search_stores_heading: "Stores",
    ui_delivery_search_stores_empty: "No store results.",
    ui_delivery_search_menu_heading: "Menu",
    ui_delivery_search_menu_empty: "No menu results.",
    ui_delivery_search_popular_heading: "Popular searches",
    ui_delivery_search_popular_empty: "No data to show.",
    ui_delivery_search_recent_heading: "Recent searches",
    ui_delivery_search_recent_empty: "No recent searches.",
    ui_delivery_search_recommended_heading: "Suggested searches",
    ui_group_chat_title: "Group chat",
    ui_group_chat_intro:
      "Creating a room makes you the owner. If you know a room id, open \`/group-chat/{id}\` directly.",
    ui_group_chat_room_name_label: "Room name (optional)",
    ui_group_chat_room_name_ph: "e.g. club chat",
    ui_group_chat_create_failed: "Could not create room.",
    ui_group_chat_no_room_id: "Response did not include a room id.",
    ui_group_chat_creating: "Creating…",
    ui_group_chat_create_room: "Create room",
    ui_group_chat_trade_list_link: "Trade chat list",
    ui_group_chat_room_id_required: "roomId is required.",
    ui_group_chat_room_not_found: "Room not found.",
    ui_jobs_detail_recruit_section: "Hiring details",
    ui_jobs_detail_conditions_section: "Work conditions",
    ui_jobs_detail_description_heading: "Description",
    ui_jobs_detail_seek_section: "Job seeker info",
    ui_jobs_detail_intro_heading: "About me",
    ui_jobs_detail_extra_section: "Additional info",
    ui_jobs_contact_chat_note: "Contact via chat only. Phone numbers are not shown on the post.",`;

const COMMUNITY_BOARD_KO = `
    community_board_category_label: "카테고리",
    community_board_title_ph: "제목을 입력하세요",
    community_board_content_ph: "내용을 입력하세요",
    community_board_photos_label: "사진",
    community_board_desc_optional_ph: "설명 (선택)",
    community_board_promo_badge: "프로모션 / 홍보 글",
    community_board_promo_cover_label: "대표 이미지 (선택)",
    community_board_promo_image_url_ph: "이미지 URL (개발용)",
    community_board_promo_title_ph: "프로모션 제목",
    community_board_promo_content_ph: "프로모션 내용을 입력하세요",
    community_board_ask_question: "질문하기",
    community_board_question_title_ph: "질문을 한 줄로 요약해 주세요",
    community_board_question_content_ph: "질문 내용을 자세히 적어 주세요",
    community_board_report_submitted: "신고가 접수되었습니다.",
    community_board_like: "좋아요",
    community_board_promo_label: "프로모션",
    community_board_empty_promo_posts: "아직 게시글이 없어요.",
    community_board_empty_questions: "아직 질문이 없어요.",
    community_board_comments_count: "댓글 {count}",`;

const COMMUNITY_BOARD_EN = `
    community_board_category_label: "Category",
    community_board_title_ph: "Enter a title",
    community_board_content_ph: "Enter content",
    community_board_photos_label: "Photos",
    community_board_desc_optional_ph: "Description (optional)",
    community_board_promo_badge: "Promotion",
    community_board_promo_cover_label: "Cover image (optional)",
    community_board_promo_image_url_ph: "Image URL (dev)",
    community_board_promo_title_ph: "Promotion title",
    community_board_promo_content_ph: "Enter promotion details",
    community_board_ask_question: "Ask a question",
    community_board_question_title_ph: "Summarize your question in one line",
    community_board_question_content_ph: "Describe your question in detail",
    community_board_report_submitted: "Report submitted.",
    community_board_like: "Like",
    community_board_promo_label: "Promotion",
    community_board_empty_promo_posts: "No posts yet.",
    community_board_empty_questions: "No questions yet.",
    community_board_comments_count: "Comments {count}",`;

function ensureCatalogBlock(filePath, anchorKey, block, blockId) {
  let s = fs.readFileSync(filePath, "utf8");
  if (s.includes(blockId)) {
    console.log("catalog skip (exists)", blockId);
    return;
  }
  const idx = s.indexOf(anchorKey);
  if (idx < 0) throw new Error(`anchor not found in ${filePath}: ${anchorKey}`);
  s = s.slice(0, idx) + block + "\n" + s.slice(idx);
  fs.writeFileSync(filePath, s);
  console.log("catalog patched", blockId);
}

ensureCatalogBlock(
  path.join(ROOT, "lib/i18n/catalog/ui-phase-finish.ts"),
  "    ui_car_accident_no: \"무사고\",",
  UI_FINISH_KO_BLOCK,
  "ui-phase-finish-ko"
);
ensureCatalogBlock(
  path.join(ROOT, "lib/i18n/catalog/ui-phase-finish.ts"),
  "    ui_car_accident_no: \"No accidents\",",
  UI_FINISH_EN_BLOCK,
  "ui-phase-finish-en"
);
ensureCatalogBlock(
  path.join(ROOT, "lib/i18n/catalog/community-ui.ts"),
  '    meeting_notices_empty_host:\n      "아래 모임 관리의 공지 등록',
  COMMUNITY_BOARD_KO,
  "community-board-ko"
);
ensureCatalogBlock(
  path.join(ROOT, "lib/i18n/catalog/community-ui.ts"),
  '    meeting_notices_empty_host:\n      "Notices from meeting admin or notice-type feed posts will appear here.",',
  COMMUNITY_BOARD_EN,
  "community-board-en"
);

function ensureImport(content) {
  if (content.includes("useI18n")) return content;
  if (!content.includes('"use client"')) return content;
  const imp = 'import { useI18n } from "@/components/i18n/AppLanguageProvider";\n';
  const idx = content.indexOf("\n", content.indexOf('"use client"'));
  return content.slice(0, idx + 1) + imp + content.slice(idx + 1);
}

function addHookAfterExport(content, fnName) {
  const needles = [`export function ${fnName}(`, `export default function ${fnName}(`];
  for (const needle of needles) {
    const i = content.indexOf(needle);
    if (i < 0) continue;
    const brace = content.indexOf(") {", i);
    if (brace < 0) continue;
    const insertAt = brace + 4;
    if (content.slice(insertAt, insertAt + 40).includes("useI18n")) return content;
    return content.slice(0, insertAt) + "\n  const { t } = useI18n();" + content.slice(insertAt);
  }
  return content;
}

function patchFile(rel, transform) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn("missing", rel);
    return;
  }
  const before = fs.readFileSync(fp, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(fp, after);
    console.log("patched", rel);
  } else console.log("unchanged", rel);
}

const patches = {
  "components/write/community/CommunityWriteForm.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "CommunityWriteForm");
    return s
      .replace('next.title = "제목을 입력해 주세요."', 'next.title = t("ui_product_err_title")')
      .replace('next.content = "내용을 입력해 주세요."', 'next.content = t("ui_write_err_content")')
      .replace(", [title, content]", ", [title, content, t]")
      .replace('title={`${category.name} · 글쓰기`}', 'title={`${category.name} · ${t("ui_write_suffix_post")}`}')
      .replace('label="사진 (선택)"', 'label={t("ui_write_photos_optional")}')
      .replace("제목 <span", '{t("ui_write_title_label")} <span')
      .replace('placeholder="제목"', 'placeholder={t("ui_write_title_ph")}')
      .replace("내용 <span", '{t("ui_write_content_label")} <span')
      .replace('placeholder="내용을 입력해 주세요"', 'placeholder={t("ui_write_content_ph")}')
      .replace('label="등록하기"', 'label={t("community_write_submit")}');
  },
  "components/write/FeatureWriteBlock.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "FeatureWriteBlock");
    return s
      .replace('title={`${category.name} · 글쓰기`}', 'title={`${category.name} · ${t("ui_write_suffix_post")}`}')
      .replace("이 카테고리는 글쓰기를 지원하지 않습니다.", '{t("ui_write_feature_unsupported")}')
      .replace("혜택·기능 페이지는 별도 안내를 확인해 주세요.", '{t("ui_write_feature_hint")}')
      .replace("카테고리로 돌아가기", '{t("ui_write_back_to_category")}');
  },
  "components/write/service/ServiceWriteForm.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "ServiceWriteForm");
    return s
      .replace('next.content = "요청 내용을 입력해 주세요."', 'next.content = t("ui_write_service_request_err")')
      .replace('next.title = "제목을 입력해 주세요."', 'next.title = t("ui_product_err_title")')
      .replace('next.content = "설명을 입력해 주세요."', 'next.content = t("ui_write_service_desc_err")')
      .replace(
        'next.location =\n        "거래 지역을 읽지 못했습니다. 주소 관리에서 대표 주소를 저장한 뒤 다시 시도해 주세요."',
        "next.location = t(\"ui_write_service_location_err\")"
      )
      .replace(", [isRequest, title, content, hasLocation, region, city]", ", [isRequest, title, content, hasLocation, region, city, t]")
      .replace('title={`${category.name} · 글쓰기`}', 'title={`${category.name} · ${t("ui_write_suffix_post")}`}')
      .replace('label="사진"', 'label={t("ui_write_photos_label")}')
      .replace("요청 내용 <span", '{t("ui_write_service_request_label")} <span')
      .replace('placeholder="어떤 도움이 필요하신가요?"', 'placeholder={t("ui_write_service_title_ph")}')
      .replace("연락 방법", '{t("ui_write_service_contact_label")}')
      .replace('placeholder="채팅, 전화 등"', 'placeholder={t("ui_write_service_contact_ph")}')
      .replace("제목 <span", '{t("ui_write_title_label")} <span')
      .replace('placeholder="제목"', 'placeholder={t("ui_write_title_ph")}')
      .replace("설명 <span", '{t("ui_write_service_desc_label")} <span')
      .replace('placeholder="서비스 내용을 입력해 주세요"', 'placeholder={t("ui_write_service_content_ph")}')
      .replace('label={isRequest ? "요청하기" : "등록하기"}', 'label={isRequest ? t("ui_write_service_request_submit") : t("community_write_submit")}');
  },
  "components/write/shared/ImageEditorModal.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "ImageEditorModal");
    return s
      .replace('aria-label="닫기"', 'aria-label={t("common_close")}')
      .replace("불러오는 중…", '{t("common_loading")}')
      .replace("<span>회전</span>", '<span>{t("ui_write_image_rotate")}</span>');
  },
  "components/write/shared/ImageUploader.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "ImageUploader");
    return s
      .replace('aria-label="사진 추가"', 'aria-label={t("ui_write_image_add_aria")}')
      .replaceAll('aria-label="삭제"', 'aria-label={t("common_delete")}');
  },
  "components/write/shared/LocationSelector.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "LocationSelector");
    return s
      .replace("ZIP 코드 (PhilPost 4자리)", '{t("ui_write_zip_philpost_label")}')
      .replace('aria-label="PhilPost ZIP 4자리"', 'aria-label={t("ui_write_zip_philpost_aria")}');
  },
  "components/write/shared/TradeFrequentPhrasesSheet.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "TradeFrequentPhrasesSheet");
    return s
      .replace('aria-label="닫기"', 'aria-label={t("common_close")}')
      .replace('placeholder="문구를 입력하세요"', 'placeholder={t("ui_write_phrase_ph")}')
      .replace('aria-label="삭제"', 'aria-label={t("common_delete")}');
  },
  "components/write/shared/WriteTradeTopicSection.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "WriteTradeTopicSection");
    return s
      .replace(
        '주제<span className="font-normal text-sam-muted"> · 하나만</span>',
        '{t("ui_write_topic_label")}<span className="font-normal text-sam-muted">{t("ui_write_topic_one_only")}</span>'
      )
      .replace(
        '주제 <span className="font-normal text-sam-muted">(하나만 선택)</span>',
        '{t("ui_write_topic_label")} <span className="font-normal text-sam-muted">{t("ui_write_topic_select_paren")}</span>'
      )
      .replace('<span className="sam-text-body text-sam-fg">전체</span>', '<span className="sam-text-body text-sam-fg">{t("ui_fav_filter_all")}</span>');
  },
  "components/write/WriteScreenTier1Sync.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "WriteScreenTier1Sync");
    return s
      .replaceAll('aria-label="닫기"', 'aria-label={t("common_close")}')
      .replace('title="글쓰기 취소"', 'title={t("ui_write_cancel_title")}')
      .replace("계속 쓰기", '{t("ui_write_continue_writing")}')
      .replace('취소\n              </button>', '{t("ui_write_cancel_confirm")}\n              </button>')
      .replace("입력한 내용이 저장되지 않습니다.", '{t("ui_write_discard_body")}');
  },
  "components/write/WriteSheetFlowInner.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "WriteSheetFlowInner");
    return s
      .replace("불러오는 중…", '{t("common_loading")}')
      .replace("권한 확인 중…", '{t("ui_write_auth_checking")}')
      .replace("카테고리를 찾을 수 없습니다.", '{t("ui_category_not_found")}')
      .replace("이 카테고리에는 글을 쓸 수 없습니다.", '{t("ui_product_edit_cannot_write_category")}')
      .replace("지원하지 않는 카테고리 타입입니다.", '{t("ui_write_unsupported_type")}')
      .replaceAll("카테고리를 선택하세요", '{t("ui_write_select_category")}')
      .replace(' ? " (작성 불가)" : ""', ' ? t("ui_write_category_disabled_suffix") : ""');
  },
  "components/write-launcher/WriteLauncher.tsx": (s) =>
    s
      .replace("불러오는 중…", '{t("common_loading")}')
      .replace("<p>노출할 주제가 없습니다.</p>", "<p>{t(\"ui_write_launcher_no_topics\")}</p>")
      .replace(
        "관리자 → 메뉴 관리에서 항목의 「런처 노출」을 켜 주세요.",
        '{t("ui_write_launcher_admin_hint")}'
      )
      .replace('aria-label="닫기"', 'aria-label={t("common_close")}'),
  "components/write-launcher/WriteLauncherOverlay.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "WriteLauncherOverlay");
    return s.replace('aria-label="글쓰기 메뉴"', 'aria-label={t("ui_write_launcher_menu_aria")}');
  },
  "components/community-board/BoardListCategoryChips.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "BoardListCategoryChips");
    return s.replace("카테고리", '{t("community_board_category_label")}');
  },
  "components/community-board/CommunityWritePage.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "CommunityWritePage");
    return s.replace("글쓰기", '{t("common_write")}');
  },
  "components/community-board/forms/CommunityForm.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "CommunityForm");
    return s
      .replace('alert("주제를 선택하세요.");', 'alert(t("community_write_select_topic_err"));')
      .replace('placeholder="제목을 입력하세요"', 'placeholder={t("community_board_title_ph")}')
      .replace('placeholder="내용을 입력하세요"', 'placeholder={t("community_board_content_ph")}');
  },
  "components/community-board/forms/GalleryForm.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "GalleryForm");
    return s
      .replace("사진</label>", '{t("community_board_photos_label")}</label>')
      .replace('placeholder="제목"', 'placeholder={t("ui_write_title_ph")}')
      .replace('placeholder="설명 (선택)"', 'placeholder={t("community_board_desc_optional_ph")}');
  },
  "components/community-board/forms/PromoForm.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "PromoForm");
    return s
      .replace("프로모션 / 홍보 글", '{t("community_board_promo_badge")}')
      .replace("대표 이미지 (선택)", '{t("community_board_promo_cover_label")}')
      .replace('placeholder="이미지 URL (개발용)"', 'placeholder={t("community_board_promo_image_url_ph")}')
      .replace('placeholder="프로모션 제목"', 'placeholder={t("community_board_promo_title_ph")}')
      .replace('placeholder="프로모션 내용을 입력하세요"', 'placeholder={t("community_board_promo_content_ph")}');
  },
  "components/community-board/forms/QuestionForm.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "QuestionForm");
    return s
      .replace("질문하기", '{t("community_board_ask_question")}')
      .replace('placeholder="질문을 한 줄로 요약해 주세요"', 'placeholder={t("community_board_question_title_ph")}')
      .replace('placeholder="질문 내용을 자세히 적어 주세요"', 'placeholder={t("community_board_question_content_ph")}');
  },
  "components/community-board/skins/detail/BasicDetailSkin.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "BasicDetailSkin");
    return s
      .replace('alert("신고가 접수되었습니다.");', 'alert(t("community_board_report_submitted"));')
      .replace(
        '{post.view_count > 0 && <span>조회 {post.view_count}</span>}',
        '{post.view_count > 0 && <span>{t("community_stat_views_inline", { count: post.view_count })}</span>}'
      );
  },
  "components/community-board/skins/detail/GalleryDetailSkin.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "GalleryDetailSkin");
    return s
      .replace(">좋아요</button>", ">{t(\"community_board_like\")}</button>")
      .replace(">신고</button>", ">{t(\"community_report\")}</button>");
  },
  "components/community-board/skins/detail/MagazineDetailSkin.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "MagazineDetailSkin");
    return s
      .replace(">좋아요</button>", ">{t(\"community_board_like\")}</button>")
      .replace(">신고</button>", ">{t(\"community_report\")}</button>");
  },
  "components/community-board/skins/detail/PromoDetailSkin.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "PromoDetailSkin");
    return s
      .replace(">프로모션</span>", ">{t(\"community_board_promo_label\")}</span>")
      .replace(">좋아요</button>", ">{t(\"community_board_like\")}</button>")
      .replace(">신고</button>", ">{t(\"community_report\")}</button>");
  },
  "components/community-board/skins/detail/QnaDetailSkin.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "QnaDetailSkin");
    return s
      .replace(">좋아요</button>", ">{t(\"community_board_like\")}</button>")
      .replace(">신고</button>", ">{t(\"community_report\")}</button>");
  },
  "components/community-board/skins/list/BasicListSkin.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "BasicListSkin");
    return s
      .replace("아직 글이 없어요.", '{t("community_feed_empty")}')
      .replace(
        '{post.view_count > 0 && <span>조회 {post.view_count}</span>}',
        '{post.view_count > 0 && <span>{t("community_stat_views_inline", { count: post.view_count })}</span>}'
      );
  },
  "components/community-board/skins/list/GalleryListSkin.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "GalleryListSkin");
    return s.replace("아직 글이 없어요.", '{t("community_feed_empty")}');
  },
  "components/community-board/skins/list/MagazineListSkin.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "MagazineListSkin");
    return s.replace("아직 글이 없어요.", '{t("community_feed_empty")}');
  },
  "components/community-board/skins/list/PromoListSkin.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "PromoListSkin");
    return s
      .replace("아직 게시글이 없어요.", '{t("community_board_empty_promo_posts")}')
      .replace(">프로모션</span>", ">{t(\"community_board_promo_label\")}</span>");
  },
  "components/community-board/skins/list/QnaListSkin.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "QnaListSkin");
    return s
      .replace("아직 질문이 없어요.", '{t("community_board_empty_questions")}')
      .replace(
        "<span>댓글 {post.comment_count}</span>",
        '<span>{t("community_board_comments_count", { count: post.comment_count })}</span>'
      );
  },
  "components/delivery/search/DeliverySearchHeader.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "DeliverySearchHeader");
    return s
      .replace('aria-label="뒤로가기"', 'aria-label={t("ui_delivery_search_back_aria")}')
      .replace('aria-label="검색"', 'aria-label={t("common_search")}')
      .replace('placeholder="먹고 싶은 메뉴나 가게를 찾아보세요"', 'placeholder={t("ui_delivery_search_input_ph")}')
      .replace('aria-label="배달 검색어 입력"', 'aria-label={t("ui_delivery_search_input_aria")}')
      .replace('aria-label="검색어 지우기"', 'aria-label={t("ui_delivery_search_clear_aria")}');
  },
  "components/delivery/search/DeliverySearchResults.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "DeliverySearchResults");
    return s
      .replace("검색 중…", '{t("ui_delivery_search_searching")}')
      .replace("검색 결과가 없습니다", '{t("ui_delivery_search_no_results_title")}')
      .replace("다른 키워드로 다시 시도해 보세요.", '{t("ui_delivery_search_no_results_hint")}')
      .replace(">가게</h2>", ">{t(\"ui_delivery_search_stores_heading\")}</h2>")
      .replace("가게 결과가 없습니다.", '{t("ui_delivery_search_stores_empty")}')
      .replace(">메뉴</h2>", ">{t(\"ui_delivery_search_menu_heading\")}</h2>")
      .replace("메뉴 결과가 없습니다.", '{t("ui_delivery_search_menu_empty")}');
  },
  "components/delivery/search/PopularSearchList.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "PopularSearchList");
    return s
      .replaceAll("인기 검색어", '{t("ui_delivery_search_popular_heading")}')
      .replace("표시할 데이터가 없습니다.", '{t("ui_delivery_search_popular_empty")}');
  },
  "components/delivery/search/RecentSearchChips.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "RecentSearchChips");
    return s
      .replaceAll("최근 검색어", '{t("ui_delivery_search_recent_heading")}')
      .replace("최근 검색어가 없습니다.", '{t("ui_delivery_search_recent_empty")}');
  },
  "components/delivery/search/RecommendedSearchChips.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "RecommendedSearchChips");
    return s.replace("추천 검색어", '{t("ui_delivery_search_recommended_heading")}');
  },
  "components/delivery/navigation/DeliveryBottomNav.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "DeliveryBottomNav");
    return s.replace('aria-label="배달 전용 메뉴"', 'aria-label={t("ui_delivery_nav_aria")}');
  },
  "components/home-feed/HomeTradeReelsSideRail.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "HomeTradeReelsSideRail");
    return s
      .replace('aria-label="거래 빠른 메뉴"', 'aria-label={t("ui_home_rail_trade_menu_aria")}')
      .replace("<span className={RAIL_LABEL_CLASS}>글쓰기</span>", '<span className={RAIL_LABEL_CLASS}>{t("nav_write_aria")}</span>')
      .replace('aria-label="글쓰기"', 'aria-label={t("nav_write_aria")}');
  },
  "components/home-feed/HomeFeedViewExperimental.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "HomeFeedViewExperimental");
    return s.replace("등록된 상품이 없어요", '{t("ui_home_feed_no_products")}');
  },
  "components/jobs/JobHiringDetailCards.tsx": (s) =>
    s
      .replace('title="모집 정보"', 'title={t("ui_jobs_detail_recruit_section")}')
      .replace('title="근무 조건"', 'title={t("ui_jobs_detail_conditions_section")}')
      .replace(">상세 설명</h3>", ">{t(\"ui_jobs_detail_description_heading\")}</h3>"),
  "components/jobs/JobSeekingDetailCards.tsx": (s) =>
    s
      .replace('title="구직 정보"', 'title={t("ui_jobs_detail_seek_section")}')
      .replace(">자기소개</h3>", ">{t(\"ui_jobs_detail_intro_heading\")}</h3>")
      .replace('title="추가 정보"', 'title={t("ui_jobs_detail_extra_section")}'),
  "components/jobs/JobDetailContextNote.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "JobDetailContextNote");
    return s.replace(
      "연락은 채팅으로 주고받아요. 전화번호는 글에 표시되지 않습니다.",
      '{t("ui_jobs_contact_chat_note")}'
    );
  },
  "app/(main)/group-chat/GroupChatHomePageClient.tsx": (s) => {
    s = ensureImport(s);
    s = addHookAfterExport(s, "GroupChatHomePageClient");
    return s
      .replace('setErr(typeof data?.error === "string" ? data.error : "생성에 실패했습니다.");', 'setErr(typeof data?.error === "string" ? data.error : t("ui_group_chat_create_failed"));')
      .replace('setErr("응답에 방 id가 없습니다.");', 'setErr(t("ui_group_chat_no_room_id"));')
      .replace('setErr("네트워크 오류입니다.");', 'setErr(t("common_network_error"));')
      .replace("그룹 채팅", '{t("ui_group_chat_title")}')
      .replace(
        "새 방을 만들면 소유자로 입장합니다. 링크로 방 id를 알면 `/group-chat/방id` 로 바로 들어갈 수 있어요.",
        '{t("ui_group_chat_intro")}'
      )
      .replace("방 이름 (선택)", '{t("ui_group_chat_room_name_label")}')
      .replace('placeholder="예: 동호회 잡담"', 'placeholder={t("ui_group_chat_room_name_ph")}')
      .replace('{busy ? "만드는 중…" : "방 만들기"}', '{busy ? t("ui_group_chat_creating") : t("ui_group_chat_create_room")}')
      .replace("거래 채팅 목록", '{t("ui_group_chat_trade_list_link")}');
  },
  "app/(main)/group-chat/[roomId]/page.tsx": (s) => {
    if (s.includes("resolveServerInitialLanguage")) return s;
    s = s.replace(
      'import { Suspense } from "react";',
      'import { Suspense } from "react";\nimport { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";\nimport { translate } from "@/lib/i18n/messages";'
    );
    s = s.replace(
      "async function GroupChatRoomPageBody({ paramsPromise }: { paramsPromise: Promise<{ roomId: string }> }) {\n  const { roomId } = await paramsPromise;",
      "async function GroupChatRoomPageBody({ paramsPromise }: { paramsPromise: Promise<{ roomId: string }> }) {\n  const lang = resolveServerInitialLanguage({});\n  const { roomId } = await paramsPromise;"
    );
    return s
      .replace("roomId가 필요합니다.", '{translate(lang, "ui_group_chat_room_id_required")}')
      .replace("로그인이 필요합니다.", '{translate(lang, "common_login_required")}')
      .replace(">로그인</Link>", '>{translate(lang, "common_login")}</Link>')
      .replace("방을 찾을 수 없습니다.", '{translate(lang, "ui_group_chat_room_not_found")}')
      .replaceAll("목록으로", '{translate(lang, "common_to_list")}');
  },
};

for (const [rel, fn] of Object.entries(patches)) {
  patchFile(rel, fn);
}

console.log("done");
