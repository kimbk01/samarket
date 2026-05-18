import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const dirs = [
  "qa-board", "launch-week", "launch-readiness", "reviews", "security",
  "member-benefits", "production-migration", "ops-benchmarks",
  "recommendation-deployments", "feed-emergency", "recommendation",
  "performance", "personalized-feed", "exposure", "my", "home-feed", "dr",
];

const REPLACEMENTS = [
  [/<option value="">전체<\/option>/g, '<option value="">{t("common_all")}</option>'],
  [/<option value="">선택<\/option>/g, '<option value="">{t("common_select")}</option>'],
  [/<option value="home">홈<\/option>/g, '<option value="home">{t("admin_surface_home")}</option>'],
  [/<option value="search">검색<\/option>/g, '<option value="search">{t("admin_surface_search")}</option>'],
  [/<option value="shop">상점<\/option>/g, '<option value="shop">{t("admin_surface_shop")}</option>'],
  [/<option value="db_down">DB 장애<\/option>/g, '<option value="db_down">{t("admin_db_failure")}</option>'],
  [/<option value="api_failure">API 장애<\/option>/g, '<option value="api_failure">{t("admin_api_failure")}</option>'],
  [/<option value="auth_failure">인증 장애<\/option>/g, '<option value="auth_failure">{t("admin_auth_failure")}</option>'],
  [/<option value="storage_failure">스토리지 장애<\/option>/g, '<option value="storage_failure">{t("admin_storage_failure")}</option>'],
  [/<option value="chat_failure">채팅 장애<\/option>/g, '<option value="chat_failure">{t("admin_chat_failure")}</option>'],
  [/<option value="payment_failure">결제 장애<\/option>/g, '<option value="payment_failure">{t("admin_payment_failure")}</option>'],
  [/<option value="production_candidate">Production 후보<\/option>/g, '<option value="production_candidate">{t("admin_production_candidate")}</option>'],
  [/<option value="dark">dark \(기본\)<\/option>/g, '<option value="dark">{t("admin_dark_default")}</option>'],
  [/placeholder="특별회원, 관리자 등"/g, 'placeholder={t("admin_badge_placeholder")}'],
  [/placeholder="공지 문구"/g, 'placeholder={t("admin_notice_placeholder")}'],
  [/placeholder="상품명·작성자·대상자·거래 ID 검색"/g, 'placeholder={t("admin_review_search_placeholder")}'],
  [/>Go-Live QA 판정</g, '>{t("admin_go_live_qa_decision")}<'],
  [/>Readiness 점수</g, '>{t("admin_readiness_score")}<'],
  [/>critical 이슈</g, '>{t("admin_critical_issues")}<'],
  [/>RLS 정책</g, '>{t("admin_rls_policy")}<'],
  [/>Fallback 버전</g, '>{t("admin_fallback_version")}<'],
  [/>운영 설정을 불러오는 중…</g, '>{t("admin_loading_ops_settings")}<'],
  [/>불러오는 중…</g, '>{t("common_loading")}<'],
  [/>목표 \{b\.targetScore\}</g, '>{t("admin_target_score")} {b.targetScore}<'],
  [/>기준 \{b\.referenceScore\}</g, '>{t("admin_reference_score")} {b.referenceScore}<'],
  [/<span className="ml-1 text-red-600">· 차단 \{entry\.blockedItems\}/g, '<span className="ml-1 text-red-600">· {t("admin_blocked_count")} {entry.blockedItems}'],
  [/>거래 ID: \{review\.transactionId\}</g, '>{t("admin_review_tx_id")}: {review.transactionId}<'],
  [/>긍정 태그:/g, '>{t("admin_review_positive_tags")}:<'],
  [/>부정 태그:/g, '>{t("admin_review_negative_tags")}:<'],
  [/>기타\(레거시\):/g, '>{t("admin_review_legacy_tags")}:<'],
  [/>신고 수:/g, '>{t("admin_review_report_count")}:<'],
  [/메모: \{log\.note\}/g, '{t("admin_log_note_prefix")}: {log.note}'],
  [/<li className="text-sam-muted">… 외 \{([^}]+)\}건<\/li>/g, '<li className="text-sam-muted">{t("admin_more_items")} {$1}{t("admin_more_items_suffix")}</li>'],
];

function ensureI18n(content) {
  let next = content;
  const needsT = next.includes('{t("');
  const isClient = /["']use client["']/.test(next);
  if (needsT && isClient && !next.includes("useI18n")) {
    if (!next.includes("AppLanguageProvider")) {
      next = next.replace(
        /(["']use client["'];?\s*\n)/,
        `$1\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n`
      );
    }
    if (!next.includes("const { t }")) {
      next = next.replace(
        /export function (\w+)\([^)]*\)\s*\{/,
        (m) => `${m}\n  const { t } = useI18n();`
      );
    }
  }
  return next;
}

let n = 0;
for (const dir of dirs) {
  const root = path.join(ROOT, "components/admin", dir);
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name)) {
        let c = fs.readFileSync(p, "utf8");
        const before = c;
        for (const [re, rep] of REPLACEMENTS) c = c.replace(re, rep);
        c = ensureI18n(c);
        if (c !== before) {
          fs.writeFileSync(p, c);
          n++;
        }
      }
    }
  }
  walk(root);
}
console.log("fixed files:", n);
