import fs from "fs";
import path from "path";
import crypto from "crypto";

const dirs = [
  "qa-board",
  "dev-sprints",
  "launch-week",
  "launch-readiness",
  "reviews",
  "security",
  "member-benefits",
  "production-migration",
  "ops-benchmarks",
  "recommendation-deployments",
  "feed-emergency",
  "recommendation",
  "performance",
  "personalized-feed",
  "exposure",
  "my",
  "home-feed",
  "operations",
  "dr",
];

const COMMON = {
  전체: "common_all",
  저장: "common_save",
  취소: "common_cancel",
  수정: "common_edit",
  삭제: "common_delete",
  검색: "common_search",
  "불러오는 중": "common_loading",
  "불러오는 중...": "common_loading",
  "처리 중...": "common_processing",
  닫기: "common_close",
  확인: "common_confirm",
  배포: "admin_misc_link_deploy",
};

const koRe = /[\uAC00-\uD7A3][\uAC00-\uD7A3a-zA-Z0-9_·/().,%:+\-—\s{}]{0,200}/g;
const strings = new Set();

for (const dir of dirs) {
  const root = path.join("components/admin", dir);
  if (!fs.existsSync(root)) continue;
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(e.name)) {
        const text = fs.readFileSync(p, "utf8");
        let m;
        while ((m = koRe.exec(text)) !== null) {
          const s = m[0].trim();
          if (s.length < 2) continue;
          if (s.includes("마닐라")) continue;
          strings.add(s);
        }
      }
    }
  }
  walk(root);
}

const keyFor = (s) => {
  if (COMMON[s]) return COMMON[s];
  const hash = crypto.createHash("sha1").update(s).digest("hex").slice(0, 10);
  return `admin_misc_${hash}`;
};

const ko = {};
const en = {};
const zh = {};
const map = {};

for (const s of [...strings].sort()) {
  const k = keyFor(s);
  map[s] = k;
  if (!ko[k]) {
    ko[k] = s;
    en[k] = s; // placeholder EN — human can refine; use simple transliteration fallback
    zh[k] = s;
  }
}

// Semantic overrides for dev sprint (known batch)
const SEM = {
  admin_dev_sprint_page_title: { ko: "개발 스프린트", en: "Dev sprints", zh: "开发冲刺" },
  admin_dev_sprint_tab_summary: { ko: "요약", en: "Summary", zh: "摘要" },
  admin_dev_sprint_tab_board: { ko: "스프린트 보드", en: "Sprint board", zh: "冲刺看板" },
  admin_dev_sprint_tab_items: { ko: "스프린트 작업", en: "Sprint items", zh: "冲刺任务" },
  admin_dev_sprint_card_summary: { ko: "스프린트 요약", en: "Sprint summary", zh: "冲刺摘要" },
  admin_dev_sprint_card_board: { ko: "스프린트 보드", en: "Sprint board", zh: "冲刺看板" },
  admin_dev_sprint_card_items: { ko: "스프린트 작업 목록", en: "Sprint item list", zh: "冲刺任务列表" },
};
for (const [k, v] of Object.entries(SEM)) {
  ko[k] = v.ko;
  en[k] = v.en;
  zh[k] = v.zh;
}

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

const lines = (obj) =>
  Object.entries(obj)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `    ${k}: "${esc(v)}",`)
    .join("\n");

const out = `/** Phase 11 misc — auto-generated + manual overrides */
export const adminMiscMessages = {
  ko: {
${lines(ko)}
  },
  en: {
${lines(en)}
  },
  "zh-CN": {
${lines(zh)}
  },
};
`;

fs.writeFileSync("lib/i18n/catalog/admin-misc.ts", out);
fs.writeFileSync(".tmp-admin-misc-string-map.json", JSON.stringify(map, null, 2));
console.log("keys:", Object.keys(ko).length, "strings:", strings.size);
