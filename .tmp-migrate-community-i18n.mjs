import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function ensureImport(content) {
  if (content.includes("useI18n")) return content;
  if (!content.includes('"use client"')) return content;
  const imp = 'import { useI18n } from "@/components/i18n/AppLanguageProvider";\n';
  const idx = content.indexOf("\n", content.indexOf('"use client"'));
  return content.slice(0, idx + 1) + imp + content.slice(idx + 1);
}

function addHook(content, hookFnName) {
  const needle = `export function ${hookFnName}(`;
  const i = content.indexOf(needle);
  if (i < 0) return content;
  const brace = content.indexOf(") {", i);
  if (brace < 0) return content;
  const insertAt = brace + 4;
  if (content.slice(insertAt, insertAt + 30).includes("useI18n")) return content;
  return content.slice(0, insertAt) + "\n  const { t } = useI18n();" + content.slice(insertAt);
}

const filePatches = {
  "components/community/meeting/MeetingEventsSection.tsx": (s) => {
    s = ensureImport(s);
    s = addHook(s, "MeetingEventsSection");
    return s
      .replace(
        'setError(json.error === "forbidden" ? "운영 로그를 볼 권한이 없습니다." : "불러오지 못했습니다.");',
        'setError(json.error === "forbidden" ? t("community_meeting_ops_forbidden") : t("community_meeting_events_load_failed"));'
      )
      .replace("[meetingId]", "[meetingId, t]")
      .replace("<h2 className=\"sam-text-body font-semibold text-sam-fg\">운영 로그</h2>", '<h2 className="sam-text-body font-semibold text-sam-fg">{t("community_meeting_ops_log")}</h2>')
      .replace("<span className=\"shrink-0\">유형</span>", '<span className="shrink-0">{t("community_filter_type")}</span>')
      .replace('<option value="all">전체</option>', '<option value="all">{t("community_filter_all")}</option>')
      .replace("표시할 기록이 없습니다.", '{t("community_no_records")}')
      .replace('{loading ? "불러오는 중…" : "더보기"}', '{loading ? t("community_events_loading") : t("community_events_load_more")}');
  },
  "components/community/post-detail/CommunityPostDetailHeader.tsx": (s) => {
    s = ensureImport(s);
    const inner = addHook(s.replace("function DetailHeaderRight", "function DetailHeaderRight"), "DetailHeaderRight");
    // DetailHeaderRight is inner - patch manually
    s = ensureImport(s);
    if (!s.includes("DetailHeaderRight") || s.includes("function DetailHeaderRight")) {
      s = s.replace(
        "function DetailHeaderRight({ r }: { r: React.MutableRefObject<ActionRefs> }) {\n  const router = useRouter();",
        'function DetailHeaderRight({ r }: { r: React.MutableRefObject<ActionRefs> }) {\n  const { t } = useI18n();\n  const router = useRouter();'
      );
    }
    s = s.replace(
      "export function CommunityPostDetailHeader({",
      'export function CommunityPostDetailHeader({'
    );
    s = s.replace(
      "}: Props) {\n  const setMainTier1Extras",
      '}: Props) {\n  const { t } = useI18n();\n  const setMainTier1Extras'
    );
    return s
      .replace('aria-label="이 글 알림 끄기(준비 중)"', 'aria-label={t("community_post_notify_off_aria")}')
      .replace('title="알림"', 'title={t("community_notify")}')
      .replace('aria-label="공유"', 'aria-label={t("community_share_aria")}')
      .replace('aria-label="더보기"', 'aria-label={t("community_more_aria")}')
      .replace('aria-label="닫기"', 'aria-label={t("common_close")}')
      .replace("신고", "{t(\"community_report\")}")
      .replace("삭제", "{t(\"community_delete\")}")
      .replace("목록으로", "{t(\"community_back_to_list\")}")
      .replace('titleText: titleText || "커뮤니티"', 'titleText: titleText || t("community_community_label")')
      .replace('ariaLabel: "피드로"', 'ariaLabel: t("community_feed_back_aria")');
  },
};

for (const [rel, patch] of Object.entries(filePatches)) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn("skip", rel);
    continue;
  }
  const before = fs.readFileSync(fp, "utf8");
  const after = patch(before);
  if (after !== before) {
    fs.writeFileSync(fp, after);
    console.log("patched", rel);
  } else console.log("unchanged", rel);
}
