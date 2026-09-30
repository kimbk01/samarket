/**
 * REBUILD 14 P6 — process-local ONE Live pointer for Admin Apply pipeline.
 *
 * Durable cross-instance persistence may bind storage later.
 * At P6 this establishes the canonical Apply → envelope → generation authority
 * without requiring Production DB migration.
 *
 * Native devices remain UNWIRED — this is Admin/service pipeline authority only.
 */

import {
  createMemoryDraftStore,
  type DraftStore,
} from "@/lib/startup-compositor/admin/save-draft";
import {
  createMemoryLiveRepository,
  type StartupLiveRepository,
} from "@/lib/startup-compositor/admin/live-repository";

const globalKey = "__dibay_r14_p6_startup_live__";

type Singleton = {
  draftStore: DraftStore;
  liveRepo: StartupLiveRepository;
};

function getSingleton(): Singleton {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: Singleton;
  };
  if (!g[globalKey]) {
    g[globalKey] = {
      draftStore: createMemoryDraftStore(),
      liveRepo: createMemoryLiveRepository(),
    };
  }
  return g[globalKey];
}

export function getProcessDraftStore(): DraftStore {
  return getSingleton().draftStore;
}

export function getProcessLiveRepository(): StartupLiveRepository {
  return getSingleton().liveRepo;
}
