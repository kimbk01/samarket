import { checksumDocument } from "./checksum";
import { parseIntroShowDocument, type IntroShowDocument } from "./document";
import { INTRO_ENGINE_ID, INTRO_ENGINE_VERSION } from "./identity";
import { mountSceneRenderer } from "./SceneRenderer";
import { createIntroTimeline, type IntroTimelineEvent } from "./Timeline";
import type { IntroShowMediaRecord } from "./LayerRenderer";

export type IntroRuntimeManifest = {
  revisionId: string;
  documentVersion: number;
  engineId: string;
  engineVersion: string;
  engineHash: string;
  document: IntroShowDocument;
  documentChecksum: string;
  media: Record<
    string,
    {
      mediaId: string;
      file: string;
      width: number;
      height: number;
      checksum: string;
    }
  >;
  completeness: "complete";
};

export type IntroHostBridge = {
  onEvent: (event: IntroTimelineEvent) => void;
};

function postToHost(event: IntroTimelineEvent): void {
  const payload = { type: event, engineId: INTRO_ENGINE_ID, engineVersion: INTRO_ENGINE_VERSION };
  const android = (globalThis as { IntroShowHostBridge?: { onEvent?: (json: string) => void } })
    .IntroShowHostBridge;
  if (android?.onEvent) {
    android.onEvent(JSON.stringify(payload));
  }
  const webkit = (
    globalThis as {
      webkit?: { messageHandlers?: { introShowHost?: { postMessage: (value: unknown) => void } } };
    }
  ).webkit;
  webkit?.messageHandlers?.introShowHost?.postMessage(payload);
}

function loadImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("media_load_fail"));
    img.src = url;
  });
}

export async function bootstrapIntroRuntime(input: {
  host: HTMLElement;
  manifest: IntroRuntimeManifest;
  resolveMediaUrl: (file: string) => string;
}): Promise<{ destroy: () => void }> {
  if (input.manifest.engineId !== INTRO_ENGINE_ID) {
    throw new Error("engine_id_mismatch");
  }
  const document = parseIntroShowDocument(input.manifest.document);
  if (!document) throw new Error("document_invalid");
  const checksum = await checksumDocument(document);
  if (checksum !== input.manifest.documentChecksum) {
    throw new Error("document_checksum_mismatch");
  }

  const media: Record<string, IntroShowMediaRecord> = {};
  const loads: Promise<void>[] = [];
  for (const layer of document.scene.layers) {
    const asset = input.manifest.media[layer.mediaId];
    if (!asset) throw new Error("media_missing");
    const url = input.resolveMediaUrl(asset.file);
    loads.push(
      loadImage(url).then(() => {
        media[layer.mediaId] = {
          mediaId: layer.mediaId,
          url,
          width: asset.width,
          height: asset.height,
        };
      }),
    );
  }
  await Promise.all(loads);

  const renderer = mountSceneRenderer(input.host, {
    document,
    media,
    mode: "runtime",
  });

  const timeline = createIntroTimeline({
    durationMs: document.scene.durationMs,
    onEvent: (event) => {
      postToHost(event);
      if (event === "HANDOFF" || event === "HANDOFF_FAIL_OPEN" || event === "ABORT") {
        timeline.stop();
      }
    },
  });

  const hostApi = {
    notifyHomePresentationReady() {
      timeline.notifyHomePresentationReady();
    },
    abort() {
      timeline.abort();
    },
  };
  (globalThis as { __INTRO_ENGINE_HOST__?: typeof hostApi }).__INTRO_ENGINE_HOST__ = hostApi;

  timeline.start();

  return {
    destroy() {
      timeline.stop();
      renderer.destroy();
    },
  };
}
