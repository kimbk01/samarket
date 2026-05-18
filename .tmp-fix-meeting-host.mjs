import fs from "node:fs";

const path = "components/community/MeetingHostControls.tsx";
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
const kickLine = lines[148];
const m = kickLine.match(/window\.confirm\("(.+?)"\)/);
if (!m) {
  console.error("kick confirm not found", kickLine);
  process.exit(1);
}
const oldConfirm = `window.confirm("${m[1]}")`;
const newConfirm = 'window.confirm(t("community_confirm_kick_member"))';
let s = fs.readFileSync(path, "utf8");
s = s.replace(oldConfirm, newConfirm);
s = s.replace(/\r?\n(\s+)보내기\r?\n(\s+<\/button>)/, "\n$1{t(\"community_meeting_kick\")}\n$2");
fs.writeFileSync(path, s);
console.log("replaced confirm:", m[1]);
