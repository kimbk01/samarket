/**
 * DIBAY INTRO — V2 foreground sync host wiring.
 * Capacitor-only. No cold-start network. No Call/Popup coupling.
 */

"use client";

import { Capacitor } from "@capacitor/core";
import {
  runIntroForegroundSync,
  type DeviceLiveFetchResult,
  type IntroAuthorityStore,
  type SyncDownloaders,
} from "./sync-engine";
import { DibayIntroAuthority } from "./native-bridge";
import type {
  IntroCandidateMetaV1,
  IntroReadyMetaV1,
} from "./local-store-paths";
import { ServerLiveStatus } from "@/lib/intro/contracts/status";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function downloadBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function createNativeStore(): IntroAuthorityStore {
  return {
    async readReadyMeta() {
      const st = await DibayIntroAuthority.getAuthorityStatus();
      if (st.ready.status !== "READY") return null;
      return {
        status: "READY",
        publishedRevisionId: st.ready.publishedRevisionId!,
        packId: st.ready.packId!,
        packIntegrity: st.ready.packIntegrity!,
        sealedAssets: (st.ready.sealedAssetIds ?? []).map((id, i) => ({
          sealedAssetId: id,
          sealedIntegrity: st.ready.sealedIntegrities?.[i] ?? "",
          relativePackPath: "",
          byteLength: 0,
        })),
        promotedAt: "",
        activePointer: null,
      } satisfies IntroReadyMetaV1;
    },
    async readCandidateMeta() {
      const st = await DibayIntroAuthority.getAuthorityStatus();
      if (st.candidate.status === "NONE") return null;
      return {
        status: st.candidate.status === "FAILED" ? "FAILED" : "CANDIDATE",
        publishedRevisionId: st.candidate.publishedRevisionId ?? "",
        packId: st.candidate.packId ?? "",
        packIntegrity: st.candidate.packIntegrity ?? "",
        downloadState: "UNKNOWN",
        compatibilityState: "UNKNOWN",
        verificationState: "UNKNOWN",
        failureCode: st.candidate.failureCode,
        localStagingRoot: "candidate",
        createdAt: "",
        updatedAt: "",
        sealedAssetIds: [],
      } satisfies IntroCandidateMetaV1;
    },
    async beginCandidate(meta) {
      await DibayIntroAuthority.beginCandidate({
        metaJson: JSON.stringify(meta),
      });
    },
    async writeCandidatePackJson(bytes) {
      await DibayIntroAuthority.writeCandidatePack({
        base64: bytesToBase64(bytes),
      });
    },
    async writeCandidateAsset({ relativePackPath, bytes }) {
      await DibayIntroAuthority.writeCandidateAsset({
        relativePackPath,
        base64: bytesToBase64(bytes),
      });
    },
    async markCandidateFailed({ failureCode, meta }) {
      await DibayIntroAuthority.markCandidateFailed({
        failureCode,
        metaJson: JSON.stringify(meta),
      });
    },
    async promoteCandidateToReady(meta) {
      await DibayIntroAuthority.promoteCandidateToReady({
        metaJson: JSON.stringify(meta),
      });
    },
    async assertFontAuthority(expected) {
      void expected;
      const r = await DibayIntroAuthority.assertFontAuthority();
      return r.ok ? { ok: true } : { ok: false, missing: r.missing };
    },
    async recordNoLiveMarker(physicalLiveKind) {
      await DibayIntroAuthority.recordNoLiveMarker({ physicalLiveKind });
    },
    async clearNoLiveMarker() {
      await DibayIntroAuthority.clearNoLiveMarker();
    },
  };
}

async function fetchDeviceLive(): Promise<DeviceLiveFetchResult> {
  try {
    const res = await fetch("/api/intro/device/live", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    const json = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok) {
      return {
        ok: false,
        kind: ServerLiveStatus.FETCH_FAILURE,
        message: String(json.message ?? json.error ?? `HTTP_${res.status}`),
      };
    }
    if (json.kind === ServerLiveStatus.NO_LIVE_INTRO) {
      return {
        ok: true,
        kind: ServerLiveStatus.NO_LIVE_INTRO,
        physicalLiveKind: String(
          json.physicalLiveKind ?? json.liveKind ?? "NO_LIVE_INTRO",
        ),
      };
    }
    if (json.kind !== ServerLiveStatus.LIVE) {
      return {
        ok: false,
        kind: ServerLiveStatus.FETCH_FAILURE,
        message: "UNEXPECTED_LIVE_KIND",
      };
    }
    const packRetrieval = json.packRetrieval as
      | { retrievalUrl?: string }
      | undefined;
    const sealedAssets = (json.sealedAssets as Array<Record<string, unknown>>) ?? [];
    return {
      ok: true,
      kind: ServerLiveStatus.LIVE,
      publishedRevisionId: String(json.publishedRevisionId),
      packId: String(json.packId),
      packIntegrity: String(json.packIntegrity),
      packRetrievalUrl: String(packRetrieval?.retrievalUrl ?? ""),
      sealedAssets: sealedAssets.map((a) => ({
        sealedAssetId: String(a.sealedAssetId),
        sealedIntegrity: String(a.sealedIntegrity),
        byteLength: Number(a.byteLength),
        relativePackPath: String(a.relativePackPath),
        retrievalUrl: String(a.retrievalUrl),
      })),
    };
  } catch (err) {
    return {
      ok: false,
      kind: ServerLiveStatus.FETCH_FAILURE,
      message: err instanceof Error ? err.message : "network_error",
    };
  }
}

let syncInFlight: Promise<unknown> | null = null;

export async function runNativeIntroForegroundSync(): Promise<unknown> {
  if (!Capacitor.isNativePlatform()) {
    return { outcome: "SKIPPED_WEB" };
  }
  if (syncInFlight) return syncInFlight;
  const downloaders: SyncDownloaders = { downloadBytes, sha256Hex };
  syncInFlight = runIntroForegroundSync({
    store: createNativeStore(),
    downloaders,
    fetchLive: fetchDeviceLive,
  })
    .then((result) => {
      if (typeof console !== "undefined") {
        console.info("[DibayIntroSync]", result.outcome, result);
      }
      return result;
    })
    .finally(() => {
      syncInFlight = null;
    });
  return syncInFlight;
}
