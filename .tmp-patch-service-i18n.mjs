import fs from "fs";
const p = "lib/community-messenger/service.ts";
let s = fs.readFileSync(p, "utf8");
const reps = [
  ['senderLabel: "나"', "senderLabel: cmServiceT(\"common_me\")"],
  ['m.label.trim() || "사용자"', "m.label.trim() || cmSvcUserDefaultLabel()"],
  ['labelById.get(id) ?? "사용자"', "labelById.get(id) ?? cmSvcUserDefaultLabel()"],
  [
    "content.length > 120 ? `${content.slice(0, 117)}…` : content || \"메시지\"",
    "cmMessagePreviewFallback(content)",
  ],
  [
    "const preview = c.length > 120 ? `${c.slice(0, 117)}…` : c || \"메시지\"",
    "const preview = cmMessagePreviewFallback(c)",
  ],
  [
    `const VOICE_LAST_PREVIEW = "음성 메시지";
const IMAGE_LAST_PREVIEW = "사진";
const FILE_LAST_PREVIEW = "파일";
const STICKER_LAST_PREVIEW = "스티커";`,
    "",
  ],
  ["VOICE_LAST_PREVIEW", "cmLastPreviewVoice()"],
  ["IMAGE_LAST_PREVIEW", "cmLastPreviewImage()"],
  ["FILE_LAST_PREVIEW", "cmLastPreviewFile()"],
  ["STICKER_LAST_PREVIEW", "cmLastPreviewSticker()"],
  [
    "items.length > 1 ? `사진 ${items.length}장` : IMAGE_LAST_PREVIEW",
    "cmLastPreviewPhotoAlbum(items.length)",
  ],
  ['trimText(row.content) || "통화"', "cmLastPreviewCall(trimText(row.content))"],
  ['trimText(row.content) || "사진"', "cmLastPreviewImage()"],
  [
    'trimText((row.metadata as { fileName?: string } | undefined)?.fileName) || FILE_LAST_PREVIEW',
    "cmLastPreviewFile(trimText((row.metadata as { fileName?: string } | undefined)?.fileName))",
  ],
  ['trimText(row.content) || "알림"', "cmLastPreviewNotification(trimText(row.content))"],
];
let n = 0;
for (const [a, b] of reps) {
  const parts = s.split(a);
  if (parts.length > 1) {
    s = parts.join(b);
    n += parts.length - 1;
  }
}
fs.writeFileSync(p, s);
console.log("replacements:", n);
