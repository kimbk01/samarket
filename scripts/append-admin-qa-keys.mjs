import fs from "fs";

const additions = {
  admin_qa_page_title: { ko: "최종 통합 QA", en: "Final integrated QA", zh: "最终集成 QA" },
  admin_qa_wont_fix: { ko: "미해결", en: "Won't fix", zh: "不修复" },
  admin_qa_conditional_go: { ko: "조건부 Go", en: "Conditional Go", zh: "有条件 Go" },
  admin_qa_priority: { ko: "우선순위", en: "Priority", zh: "优先级" },
  admin_qa_description: { ko: "설명", en: "Description", zh: "说明" },
  admin_qa_owner_label: { ko: "담당", en: "Owner", zh: "负责人" },
  admin_qa_executed_at: { ko: "실행일시", en: "Executed at", zh: "执行时间" },
  admin_qa_fail_reason: { ko: "실패/차단 사유", en: "Fail/block reason", zh: "失败/阻塞原因" },
  admin_qa_linked_test: { ko: "연결 테스트", en: "Linked test", zh: "关联测试" },
  admin_qa_reproduce: { ko: "재현", en: "Reproduced", zh: "复现" },
  admin_qa_notes: { ko: "비고", en: "Notes", zh: "备注" },
  admin_qa_must_pass: { ko: "Must-Pass", en: "Must-Pass", zh: "Must-Pass" },
  admin_qa_pass_rate: { ko: "통과/전체", en: "Pass/total", zh: "通过/总计" },
  admin_qa_tab_overview: { ko: "QA 개요", en: "QA overview", zh: "QA 概览" },
  admin_qa_tab_cases: { ko: "테스트 케이스", en: "Test cases", zh: "测试用例" },
  admin_qa_tab_issues: { ko: "QA 이슈", en: "QA issues", zh: "QA 问题" },
  admin_qa_tab_blocker: { ko: "Blocker 보드", en: "Blocker board", zh: "Blocker 看板" },
  admin_qa_env_local: { ko: "Local", en: "Local", zh: "Local" },
  admin_qa_env_staging: { ko: "Staging", en: "Staging", zh: "Staging" },
  admin_qa_pilot_onboarding: { ko: "온보딩", en: "Onboarding", zh: "入门" },
  admin_qa_pilot_browsing: { ko: "둘러보기", en: "Browsing", zh: "浏览" },
  admin_qa_pilot_posting: { ko: "등록", en: "Posting", zh: "发布" },
  admin_qa_pilot_chat: { ko: "채팅", en: "Chat", zh: "聊天" },
  admin_qa_pilot_reporting: { ko: "신고", en: "Reporting", zh: "举报" },
  admin_qa_pilot_points: { ko: "포인트", en: "Points", zh: "积分" },
  admin_qa_pilot_admin_response: { ko: "관리자 응답", en: "Admin response", zh: "管理员回复" },
  admin_qa_domain_auth: { ko: "회원가입/로그인", en: "Auth", zh: "注册/登录" },
  admin_qa_domain_product: { ko: "상품 등록/수정/삭제", en: "Products", zh: "商品" },
  admin_qa_domain_feed: { ko: "홈/검색/추천", en: "Feed", zh: "Feed" },
  admin_qa_domain_chat: { ko: "채팅/거래상태", en: "Chat", zh: "聊天" },
  admin_qa_domain_moderation: { ko: "신고/제재", en: "Moderation", zh: "审核" },
  admin_qa_domain_point_payment: { ko: "포인트/결제", en: "Points/payment", zh: "积分/支付" },
  admin_qa_domain_ads_business: { ko: "광고/상점", en: "Ads/shop", zh: "广告/店铺" },
  admin_qa_domain_admin_console: { ko: "관리자 콘솔", en: "Admin console", zh: "管理后台" },
  admin_qa_domain_ops: { ko: "운영 도구", en: "Ops tools", zh: "运营工具" },
  admin_qa_domain_security: { ko: "보안/RLS", en: "Security/RLS", zh: "安全/RLS" },
  admin_launch_week_filter_all_days: { ko: "전체 (Day 1~7)", en: "All (Day 1–7)", zh: "全部 (第1–7天)" },
  admin_review_status_visible: { ko: "표시", en: "Visible", zh: "显示" },
  admin_review_status_hidden: { ko: "숨김", en: "Hidden", zh: "隐藏" },
  admin_review_status_reported: { ko: "신고됨", en: "Reported", zh: "已举报" },
  admin_review_public_good: { ko: "좋아요", en: "Good", zh: "好评" },
  admin_review_public_normal: { ko: "보통", en: "Normal", zh: "一般" },
  admin_review_public_bad: { ko: "별로", en: "Bad", zh: "差评" },
  admin_review_role_buyer_to_seller: { ko: "구매자 → 판매자", en: "Buyer → seller", zh: "买家 → 卖家" },
  admin_review_role_seller_to_buyer: { ko: "판매자 → 구매자", en: "Seller → buyer", zh: "卖家 → 买家" },
  admin_review_action_hide: { ko: "리뷰 숨김", en: "Hide review", zh: "隐藏评价" },
  admin_review_action_restore: { ko: "리뷰 복구", en: "Restore review", zh: "恢复评价" },
  admin_review_action_review_only: { ko: "검토만", en: "Review only", zh: "仅审核" },
  admin_review_action_recalc_trust: { ko: "신뢰도 재계산", en: "Recalculate trust", zh: "重新计算信任度" },
  admin_review_rating_1: { ko: "1점", en: "1 star", zh: "1 分" },
  admin_review_rating_2: { ko: "2점", en: "2 stars", zh: "2 分" },
  admin_review_rating_3: { ko: "3점", en: "3 stars", zh: "3 分" },
  admin_review_rating_4: { ko: "4점", en: "4 stars", zh: "4 分" },
  admin_review_rating_5: { ko: "5점", en: "5 stars", zh: "5 分" },
  admin_review_public_label: { ko: "공개 후기", en: "Public review", zh: "公开评价" },
  admin_review_rating_label: { ko: "평점", en: "Rating", zh: "评分" },
  admin_review_role_label: { ko: "역할", en: "Role", zh: "角色" },
  admin_review_open_chat: { ko: "채팅방 열기", en: "Open chat", zh: "打开聊天" },
  admin_review_created_at: { ko: "작성일", en: "Created", zh: "创建时间" },
  admin_misc_select_option: { ko: "선택", en: "Select", zh: "选择" },
};

let cat = fs.readFileSync("lib/i18n/catalog/admin-misc.ts", "utf8");
for (const [key, v] of Object.entries(additions)) {
  for (const loc of ["ko", "en", '"zh-CN"']) {
    const val = loc === "ko" ? v.ko : loc === "en" ? v.en : v.zh;
    const line = `    ${key}: "${val.replace(/"/g, '\\"')}",\n`;
    if (!cat.includes(`${key}:`)) {
      cat = cat.replace(`  ${loc}: {\n`, `  ${loc}: {\n${line}`);
    }
  }
}
fs.writeFileSync("lib/i18n/catalog/admin-misc.ts", cat);
console.log("done");
