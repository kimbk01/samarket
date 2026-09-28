import { createHash } from "node:crypto";
import { collectMediaIds, type DibayIntroDocument } from "@/lib/dibay-intro/document";
import { documentChecksum } from "@/lib/dibay-intro/checksum";
import { ENGINE_ID, ENGINE_VERSION } from "@/lib/dibay-intro/engine/identity";
import type { DibayIntroPackManifest } from "@/lib/dibay-intro/pack/manifest";

export type PackMediaInput = {
  id: string;
  mime: string;
  animated: boolean;
  bytes: Buffer;
  ext: string;
};

export type BuiltIntroPack = {
  files: Map<string, Buffer>;
  manifest: DibayIntroPackManifest;
};

function sha(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

const INDEX_HTML = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <style>
    html,body,#stage{margin:0;padding:0;width:100%;height:100%;background:#0B421A;overflow:hidden}
    @font-face{font-family:"Pretendard Variable";src:url("./fonts/PretendardVariable.woff2") format("woff2");font-weight:100 900;font-display:block}
    body{font-family:"Pretendard Variable",sans-serif}
  </style>
</head>
<body>
  <div id="stage"></div>
  <script>
    window.DibayIntroHost = {
      trace: function (payload) {
        try {
          if (window.IntroHostBridge && window.IntroHostBridge.trace) {
            window.IntroHostBridge.trace(JSON.stringify(payload));
          } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.DibayIntroHost) {
            window.webkit.messageHandlers.DibayIntroHost.postMessage(payload);
          }
        } catch (e) {}
      }
    };
  </script>
  <script src="./engine.js"></script>
</body>
</html>
`;

export function buildSealedIntroPack(input: {
  introId: string;
  revisionId: string;
  document: DibayIntroDocument;
  engineJs: Buffer;
  engineHash: string;
  fontBytes: Buffer;
  media: PackMediaInput[];
}): BuiltIntroPack {
  const files = new Map<string, Buffer>();
  files.set("index.html", Buffer.from(INDEX_HTML, "utf8"));
  files.set("engine.js", input.engineJs);
  files.set("document.json", Buffer.from(JSON.stringify(input.document), "utf8"));
  files.set("fonts/PretendardVariable.woff2", input.fontBytes);
  const mediaManifest: DibayIntroPackManifest["media"] = [];
  const needed = new Set(collectMediaIds(input.document));
  for (const item of input.media) {
    const file = `media/${item.id}.${item.ext}`;
    files.set(file, item.bytes);
    mediaManifest.push({
      id: item.id,
      file,
      mime: item.mime,
      animated: item.animated,
      checksum: sha(item.bytes),
    });
    needed.delete(item.id);
  }
  if (needed.size) {
    throw new Error("pack_media_incomplete");
  }
  const manifest: DibayIntroPackManifest = {
    version: 1,
    introId: input.introId,
    revisionId: input.revisionId,
    engineId: ENGINE_ID,
    engineVersion: ENGINE_VERSION,
    engineHash: input.engineHash,
    documentChecksum: documentChecksum(input.document),
    font: { family: "Pretendard Variable", file: "fonts/PretendardVariable.woff2" },
    media: mediaManifest,
    completeness: "READY",
  };
  files.set("manifest.json", Buffer.from(JSON.stringify(manifest), "utf8"));
  files.set("READY", Buffer.from("READY", "utf8"));
  return { files, manifest };
}
