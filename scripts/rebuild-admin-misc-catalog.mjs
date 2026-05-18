/** Rebuild admin-misc.ts with validated UI strings only. */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const TARGET_DIRS = [
  "qa-board", "launch-week", "launch-readiness", "reviews", "security",
  "member-benefits", "production-migration", "ops-benchmarks",
  "recommendation-deployments", "feed-emergency", "recommendation",
  "performance", "personalized-feed", "exposure", "my", "home-feed", "dr",
];
const PREFIX = {
  "qa-board": "admin_qa", "launch-week": "admin_launch_week",
  "launch-readiness": "admin_launch_readiness", "reviews": "admin_review",
  "security": "admin_security", "member-benefits": "admin_member_benefit",
  "production-migration": "admin_prod_migration", "ops-benchmarks": "admin_ops_benchmark",
  "recommendation-deployments": "admin_rec_deploy", "feed-emergency": "admin_feed_emergency",
  recommendation: "admin_rec_analytics", performance: "admin_performance",
  "personalized-feed": "admin_personalized_feed", exposure: "admin_exposure",
  my: "admin_my", "home-feed": "admin_home_feed", dr: "admin_dr",
};
const COMMON = {
  전체: "common_all", 저장: "common_save", 취소: "common_cancel",
  수정: "common_edit", 삭제: "common_delete", 검색: "common_search",
  "불러오는 중": "common_loading", "불러오는 중…": "common_loading",
  "불러오는 중...": "common_loading", "처리 중...": "common_processing",
  닫기: "common_close", 확인: "common_confirm", 편집: "common_edit", 추가: "common_add",
  선택: "common_select",
};

function valid(s) {
  if (!s || s.length < 2 || s.length > 100) return false;
  if (!/[\uAC00-\uD7A3]/.test(s)) return false;
  if (/[\n\r{}\\]/.test(s)) return false;
  if (/["`]/.test(s)) return false;
  if (/headers|export |import |function |=>|\.map|\.filter/.test(s)) return false;
  if (s.includes("마닐라") && s.includes("Malate")) return false;
  return true;
}

function extractStrings(text) {
  const out = new Set();
  for (const m of text.matchAll(/["'`]([^"'`\n]{1,100})["'`]/g)) {
    if (valid(m[1])) out.add(m[1].trim());
  }
  for (const m of text.matchAll(/>([^<>{}\n]{1,80})</g)) {
    const s = m[1].trim();
    if (valid(s)) out.add(s);
  }
  for (const m of text.matchAll(/t\("([^"]+)"\)/g)) {
    /* keep existing keys referenced */
  }
  return out;
}

const ko = {};
const en = {};
const zh = {};
const used = new Set(Object.values(COMMON));

function slug(text) {
  const h = crypto.createHash("sha1").update(text).digest("hex").slice(0, 8);
  return `k${h}`;
}

function add(folder, s) {
  if (COMMON[s]) return COMMON[s];
  const prefix = PREFIX[folder] ?? "admin_misc";
  let key = `${prefix}_${slug(s)}`;
  let n = 2;
  while (used.has(key)) {
    if (ko[key] === s) return key;
    key = `${prefix}_${slug(s)}_${n++}`;
  }
  used.add(key);
  ko[key] = s;
  en[key] = s;
  zh[key] = s;
  return key;
}

for (const folder of TARGET_DIRS) {
  const root = path.join(ROOT, "components/admin", folder);
  if (!fs.existsSync(root)) continue;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(e.name)) {
        const text = fs.readFileSync(p, "utf8");
        for (const s of extractStrings(text)) add(folder, s);
        for (const m of text.matchAll(/t\("((?:admin_[^"]+))"\)/g)) {
          const key = m[1];
          if (!used.has(key)) used.add(key);
        }
      }
    }
  };
  walk(root);
}

// Also scan lib utils in these domains
for (const lib of ["lib/qa-board/qa-board-utils.ts", "lib/admin-reviews/admin-review-utils.ts"]) {
  const p = path.join(ROOT, lib);
  if (!fs.existsSync(p)) continue;
  const folder = lib.includes("qa-board") ? "qa-board" : "reviews";
  for (const s of extractStrings(fs.readFileSync(p, "utf8"))) add(folder, s);
}

// Semantic overrides
const SEM = {
  admin_qa_page_title: { ko: "최종 통합 QA", en: "Final integrated QA", zh: "最终集成 QA" },
  admin_launch_week_page_title: { ko: "오픈 직후 첫 주", en: "First week after launch", zh: "上线后首周" },
  admin_launch_readiness_page_title: { ko: "런칭 준비", en: "Launch readiness", zh: "上线准备" },
  admin_review_list_title: { ko: "거래 후기 목록", en: "Trade reviews", zh: "交易评价列表" },
  admin_review_detail_title: { ko: "리뷰 상세", en: "Review detail", zh: "评价详情" },
  admin_security_page_title: { ko: "보안 / 권한 / RLS 점검", en: "Security / permissions / RLS", zh: "安全/权限/RLS" },
  admin_member_benefit_page_title: { ko: "회원 혜택 정책", en: "Member benefits", zh: "会员权益政策" },
  admin_prod_migration_page_title: { ko: "프로덕션 전환", en: "Production migration", zh: "生产迁移" },
  admin_ops_benchmark_page_title: { ko: "운영 벤치마크", en: "Ops benchmarks", zh: "运营基准" },
  admin_rec_deploy_page_title: { ko: "추천 배포 관리", en: "Recommendation deployments", zh: "推荐部署管理" },
  admin_feed_emergency_page_title: { ko: "피드 장애 대응", en: "Feed emergency", zh: "Feed 应急" },
  admin_rec_analytics_page_title: { ko: "추천·행동 분석", en: "Recommendation analytics", zh: "推荐与行为分析" },
  admin_performance_page_title: { ko: "성능 최적화", en: "Performance", zh: "性能优化" },
  admin_personalized_feed_page_title: { ko: "개인화 추천 정책", en: "Personalized feed", zh: "个性化推荐" },
  admin_exposure_page_title: { ko: "노출 점수 정책", en: "Exposure scoring", zh: "曝光评分" },
  admin_dr_page_title: { ko: "DR / 재해복구 시나리오", en: "DR scenarios", zh: "DR 场景" },
  admin_home_feed_page_title: { ko: "홈 피드 정책", en: "Home feed policy", zh: "首页 Feed 策略" },
  admin_review_tx_id: { ko: "거래 ID", en: "Transaction ID", zh: "交易 ID" },
  admin_review_positive_tags: { ko: "긍정 태그", en: "Positive tags", zh: "正面标签" },
  admin_review_negative_tags: { ko: "부정 태그", en: "Negative tags", zh: "负面标签" },
  admin_review_legacy_tags: { ko: "기타(레거시)", en: "Other (legacy)", zh: "其他(遗留)" },
  admin_review_report_count: { ko: "신고 수", en: "Reports", zh: "举报数" },
  admin_review_search_placeholder: { ko: "상품명·작성자·대상자·거래 ID 검색", en: "Search product, author, target, transaction ID", zh: "搜索商品、作者、对象、交易 ID" },
  admin_log_note_prefix: { ko: "메모", en: "Note", zh: "备注" },
  admin_go_live_qa_decision: { ko: "Go-Live QA 판정", en: "Go-Live QA decision", zh: "Go-Live QA 判定" },
  admin_readiness_score: { ko: "Readiness 점수", en: "Readiness score", zh: "Readiness 分数" },
  admin_blocked_count: { ko: "차단", en: "Blocked", zh: "阻塞" },
  admin_rls_policy: { ko: "RLS 정책", en: "RLS policies", zh: "RLS 策略" },
  admin_critical_issues: { ko: "critical 이슈", en: "Critical issues", zh: "严重问题" },
  admin_production_candidate: { ko: "Production 후보", en: "Production candidate", zh: "生产候选" },
  admin_fallback_version: { ko: "Fallback 버전", en: "Fallback version", zh: "Fallback 版本" },
  admin_notice_placeholder: { ko: "공지 문구", en: "Notice text", zh: "公告文案" },
  admin_loading_ops_settings: { ko: "운영 설정을 불러오는 중…", en: "Loading ops settings…", zh: "正在加载运营设置…" },
  admin_more_items: { ko: "… 외", en: "… and", zh: "… 另有" },
  admin_more_items_suffix: { ko: "건", en: " more", zh: " 条" },
  admin_dark_default: { ko: "dark (기본)", en: "dark (default)", zh: "dark（默认）" },
  admin_badge_placeholder: { ko: "특별회원, 관리자 등", en: "e.g. VIP, admin", zh: "如 VIP、管理员" },
  admin_target_score: { ko: "목표", en: "Target", zh: "目标" },
  admin_reference_score: { ko: "기준", en: "Reference", zh: "基准" },
  admin_surface_home: { ko: "홈", en: "Home", zh: "首页" },
  admin_surface_search: { ko: "검색", en: "Search", zh: "搜索" },
  admin_surface_shop: { ko: "상점", en: "Shop", zh: "店铺" },
  admin_db_failure: { ko: "DB 장애", en: "DB outage", zh: "数据库故障" },
  admin_api_failure: { ko: "API 장애", en: "API outage", zh: "API 故障" },
  admin_auth_failure: { ko: "인증 장애", en: "Auth outage", zh: "认证故障" },
  admin_storage_failure: { ko: "스토리지 장애", en: "Storage outage", zh: "存储故障" },
  admin_chat_failure: { ko: "채팅 장애", en: "Chat outage", zh: "聊天故障" },
  admin_payment_failure: { ko: "결제 장애", en: "Payment outage", zh: "支付故障" },
};
for (const [k, v] of Object.entries(SEM)) {
  used.add(k);
  ko[k] = v.ko;
  en[k] = v.en;
  zh[k] = v.zh;
}

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
const lines = (o) =>
  Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `    ${k}: "${esc(v)}",`).join("\n");

fs.writeFileSync(
  path.join(ROOT, "lib/i18n/catalog/admin-misc.ts"),
  `/** Phase 11: admin misc domains */\nexport const adminMiscMessages = {\n  ko: {\n${lines(ko)}\n  },\n  en: {\n${lines(en)}\n  },\n  "zh-CN": {\n${lines(zh)}\n  },\n};\n`
);
console.log("keys:", Object.keys(ko).length);
