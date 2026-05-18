import fs from "fs";
const p = "lib/community-messenger/service.ts";
let s = fs.readFileSync(p, "utf8");
const old1 =
  "content: target ? `멤버보내기 · ${target.label}` : \"멤버보내기\",";
const old2 =
  "content: targetProfile ? `멤버보내기 · ${targetProfile.label}` : \"멤버보내기\",";
const new1 = "content: cmMgmtMemberKickContent(target?.label),";
const new2 = "content: cmMgmtMemberKickContent(targetProfile?.label),";
// Extract exact template from file
const idx = s.indexOf("content: target ?");
const end = s.indexOf("},", idx);
const exact = s.slice(idx, s.indexOf(",", idx) + 1);
console.log("exact:", JSON.stringify(exact));
const n1 = s.split(exact).length - 1;
if (n1 > 0) {
  s = s.split(exact).join(new1);
}
const idx2 = s.indexOf("content: targetProfile ?");
const exact2 = s.slice(idx2, s.indexOf(",", idx2) + 1);
console.log("exact2:", JSON.stringify(exact2));
const n2 = s.split(exact2).length - 1;
if (n2 > 0) {
  s = s.split(exact2).join(new2);
}
fs.writeFileSync(p, s);
console.log({ n1, n2 });
