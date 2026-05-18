import fs from "fs";

const reqPath = "components/community-messenger/MessengerFriendRequestsSheet.tsx";
let req = fs.readFileSync(reqPath, "utf8");
req = req.replace(
  /import type \{ ReactNode \} from "react";\nimport \{\n  MessengerFriendAddCtaLabels,\n  MessengerFriendRequestSheetLabels,\n\} from "@\/lib\/community-messenger\/messenger-friend-add-cta";/,
  `import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  MessengerFriendAddCtaLabelKeys,
  MessengerFriendRequestSheetLabelKeys,
} from "@/lib/community-messenger/messenger-friend-add-cta";`
);
req = req.replace(
  "}: Props) {\n  return (",
  `}: Props) {
  const { t } = useI18n();
  const L = MessengerFriendRequestSheetLabelKeys;
  const C = MessengerFriendAddCtaLabelKeys;

  return (`
);
const reqMap = [
  ["MessengerFriendRequestSheetLabels.title", "t(L.title)"],
  ["MessengerFriendRequestSheetLabels.sectionReceived", "t(L.sectionReceived)"],
  ["MessengerFriendRequestSheetLabels.subtitleReceived", "t(L.subtitleReceived)"],
  ["MessengerFriendRequestSheetLabels.processing", "t(L.processing)"],
  ["MessengerFriendAddCtaLabels.reject", "t(C.reject)"],
  ["MessengerFriendAddCtaLabels.accept", "t(C.accept)"],
  ["MessengerFriendRequestSheetLabels.emptyReceived", "t(L.emptyReceived)"],
  ["MessengerFriendRequestSheetLabels.sectionSent", "t(L.sectionSent)"],
  ["MessengerFriendRequestSheetLabels.subtitleSent", "t(L.subtitleSent)"],
  ["MessengerFriendAddCtaLabels.cancel", "t(C.cancel)"],
  ["MessengerFriendRequestSheetLabels.emptySent", "t(L.emptySent)"],
  ["MessengerFriendRequestSheetLabels.sectionSuggested", "t(L.sectionSuggested)"],
  ["MessengerFriendRequestSheetLabels.openProfile", "t(L.openProfile)"],
  ["MessengerFriendRequestSheetLabels.emptySuggested", "t(L.emptySuggested)"],
  ['aria-label="닫기"', 'aria-label={t("nav_close")}'],
  [">닫기<", ">{t(\"nav_close\")}<"],
  ['?? "추천"', '?? t("cm_ui_recommended")'],
];
for (const [a, b] of reqMap) req = req.split(a).join(b);
fs.writeFileSync(reqPath, req);

const addPath = "components/community-messenger/MessengerFriendAddSheet.tsx";
let add = fs.readFileSync(addPath, "utf8");
if (!add.includes("MessengerFriendAddCtaLabelKeys")) {
  add = add.replace(
    "import { MessengerFriendAddCtaLabels, resolveMessengerFriendAddCta }",
    "import { MessengerFriendAddCtaLabelKeys, resolveMessengerFriendAddCta }"
  );
}
const addMap = [
  ["MessengerFriendAddCtaLabels.friend", "t(MessengerFriendAddCtaLabelKeys.friend)"],
  ["MessengerFriendAddCtaLabels.unavailable", "t(MessengerFriendAddCtaLabelKeys.unavailable)"],
  ["MessengerFriendAddCtaLabels.pending", "t(MessengerFriendAddCtaLabelKeys.pending)"],
  ["MessengerFriendAddCtaLabels.cancel", "t(MessengerFriendAddCtaLabelKeys.cancel)"],
  ["MessengerFriendAddCtaLabels.reject", "t(MessengerFriendAddCtaLabelKeys.reject)"],
  ["MessengerFriendAddCtaLabels.accept", "t(MessengerFriendAddCtaLabelKeys.accept)"],
  ["MessengerFriendAddCtaLabels.cooldown", "t(MessengerFriendAddCtaLabelKeys.cooldown)"],
  ["MessengerFriendAddCtaLabels.add", "t(MessengerFriendAddCtaLabelKeys.add)"],
];
for (const [a, b] of addMap) add = add.split(a).join(b);
fs.writeFileSync(addPath, add);

console.log("requests leftover labels:", (req.match(/MessengerFriend(RequestSheetLabels|AddCtaLabels)/g) || []).length);
console.log("add leftover labels:", (add.match(/MessengerFriendAddCtaLabels/g) || []).length);
