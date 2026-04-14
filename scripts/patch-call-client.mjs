import fs from "node:fs";
const p = new URL("../components/community-messenger/CommunityMessengerCallClient.tsx", import.meta.url);
let s = fs.readFileSync(p, "utf8");
const fixes = [
  [
    /showMessengerSnackbar\("[^"]*라가[^"]*"\)/,
    'showMessengerSnackbar("\uce74\uba54\ub77c\uac00 \uc774\ubbf8 \ucf1c\uc838 \uc788\uc2b5\ub2c8\ub2e4.")',
  ],
  [
    /\? "[^"]*한이 없습니다\."/,
    '? "\uad8c\ud55c\uc774 \uc5c6\uc2b5\ub2c8\ub2e4."',
  ],
  [
    /: "영상 전환에 실패했습니다\.[^"]*"/,
    ': "\uc601\uc0c1 \uc804\ud658\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694."',
  ],
  [/"통화[^"]*습니다\."/, '"\ud1b5\ud654 \uc5f0\uacb0\uc774 \ub04a\uc5b4\uc84c\uc2b5\ub2c8\ub2e4."'],
  [
    /\/\*\* 상대가 세션을[\s\S]*?\*\/\r?\n  useEffect\(\(\) => \{\r?\n    if \(!session \|\| session\.callKind !== "video"/,
    '/** Remote upgraded session to video — same call, publish local camera. */\n  useEffect(() => {\n    if (!session || session.callKind !== "video"',
  ],
];
for (const [re, rep] of fixes) {
  const next = s.replace(re, rep);
  if (next === s) console.warn("no match:", re);
  s = next;
}
s = s.replace(
  /\r?\n  const hintVideoCallFromVoiceUi = useCallback\(\(\) => \{\r?\n    showMessengerSnackbar\(\r?\n      "[^"]+"\r?\n    \);\r?\n    navigateToChatDuringCall\(\);\r?\n  \}, \[navigateToChatDuringCall\]\);\r?\n/,
  "\n"
);
fs.writeFileSync(p, s);
console.log("done");
