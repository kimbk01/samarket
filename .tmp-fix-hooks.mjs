import fs from "node:fs";

const files = [
  "components/community/CommunityPostDetailClient.tsx",
  "components/community/MeetingJoinRequestModal.tsx",
  "components/community/post-detail/CommunityCommentComposerForm.tsx",
  "components/community/post-detail/CommunityCommentItem.tsx",
  "components/community/post-detail/CommunityInlineAdCard.tsx",
  "components/community/post-detail/CommunityPostCategoryRow.tsx",
  "components/community/post-detail/CommunityPostDetailAuthorRow.tsx",
];

const imp = 'import { useI18n } from "@/components/i18n/AppLanguageProvider";\n';

for (const fp of files) {
  let s = fs.readFileSync(fp, "utf8");
  if (!s.includes("useI18n")) {
    const idx = s.indexOf("\n", s.indexOf('"use client"'));
    s = s.slice(0, idx + 1) + imp + s.slice(idx + 1);
  }
  if (!s.includes("const { t } = useI18n()")) {
    const m = s.match(/export function \w+[^{]*\{\n/);
    if (m) {
      const at = m.index + m[0].length;
      s = s.slice(0, at) + "  const { t } = useI18n();\n" + s.slice(at);
    } else {
      const m2 = s.match(/function \w+[^{]*\{\n/);
      if (m2 && fp.includes("CommunityCommentComposerForm")) {
        const at = m2.index + m2[0].length;
        s = s.slice(0, at) + "  const { t } = useI18n();\n" + s.slice(at);
      }
    }
  }
  fs.writeFileSync(fp, s);
  console.log("fixed", fp);
}

// CommunityPostDetailHeader outer component
const hdr = fs.readFileSync("components/community/post-detail/CommunityPostDetailHeader.tsx", "utf8");
if (!hdr.includes("CommunityPostDetailHeader") || hdr.includes("export function CommunityPostDetailHeader")) {
  let s = hdr;
  if (!s.match(/export function CommunityPostDetailHeader[\s\S]*?const \{ t \}/)) {
    s = s.replace(
      /(export function CommunityPostDetailHeader\([^)]*\)[^{]*\{)\n/,
      "$1\n  const { t } = useI18n();\n"
    );
    fs.writeFileSync("components/community/post-detail/CommunityPostDetailHeader.tsx", s);
    console.log("fixed header outer");
  }
}
