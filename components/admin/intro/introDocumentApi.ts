import type { IntroDocumentV1 } from "@/lib/intro/contracts/document";

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export type IntroDocumentListItemDto = {
  documentId: string;
  title: string;
  draftVersion: number;
  sceneCount: number;
  updatedAt: string;
  createdAt: string;
  hasPublishedRevision: boolean;
  isCurrentLive: boolean;
};

export type IntroDocumentRecordDto = {
  documentId: string;
  title: string;
  draftVersion: number;
  document: IntroDocumentV1;
  updatedAt: string;
  createdAt: string;
};

export async function listIntroDocumentsApi(): Promise<{
  ok: boolean;
  items: IntroDocumentListItemDto[];
  error?: string;
}> {
  const res = await fetch("/api/admin/intro/documents", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  const json = await parseJson(res);
  if (!res.ok || json.ok !== true) {
    return {
      ok: false,
      items: [],
      error: String(json.error ?? "list_failed"),
    };
  }
  return {
    ok: true,
    items: (json.items as IntroDocumentListItemDto[]) ?? [],
  };
}

export async function createIntroDocumentApi(title?: string): Promise<{
  ok: boolean;
  record?: IntroDocumentRecordDto;
  error?: string;
}> {
  const res = await fetch("/api/admin/intro/documents", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ title }),
  });
  const json = await parseJson(res);
  if (!res.ok || json.ok !== true) {
    return { ok: false, error: String(json.error ?? "create_failed") };
  }
  return {
    ok: true,
    record: {
      documentId: String(json.documentId),
      title: String(json.title),
      draftVersion: Number(json.draftVersion),
      document: json.document as IntroDocumentV1,
      updatedAt: String(json.updatedAt),
      createdAt: String(json.createdAt),
    },
  };
}

export async function getIntroDocumentApi(documentId: string): Promise<{
  ok: boolean;
  record?: IntroDocumentRecordDto;
  error?: string;
  status: number;
}> {
  const res = await fetch(`/api/admin/intro/documents/${documentId}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  const json = await parseJson(res);
  if (!res.ok || json.ok !== true) {
    return {
      ok: false,
      status: res.status,
      error: String(json.error ?? "get_failed"),
    };
  }
  return {
    ok: true,
    status: res.status,
    record: {
      documentId: String(json.documentId),
      title: String(json.title),
      draftVersion: Number(json.draftVersion),
      document: json.document as IntroDocumentV1,
      updatedAt: String(json.updatedAt),
      createdAt: String(json.createdAt),
    },
  };
}

export type IntroPublishResultDto = {
  publishOperationId: string;
  publishedRevisionId: string;
  packId: string;
  documentIntegrity: string;
  packIntegrity: string;
  packStoragePath: string;
  sourceDraftVersion: number;
  liveKind: string;
  liveInert: boolean;
  resumed: boolean;
  verdict: {
    adminToPack: string;
    adminToApp: string;
    setLive: boolean;
    appExposure: string;
  };
  identityTrace?: Record<string, unknown>;
  packSummary?: Record<string, unknown>;
};

export async function publishIntroDocumentApi(args: {
  documentId: string;
  sourceDraftVersion: number;
  idempotencyKey: string;
}): Promise<{
  ok: boolean;
  result?: IntroPublishResultDto;
  error?: string;
  code?: string;
  status: number;
  issues?: unknown;
  message?: string;
}> {
  const res = await fetch(
    `/api/admin/intro/documents/${args.documentId}/publish`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sourceDraftVersion: args.sourceDraftVersion,
        idempotencyKey: args.idempotencyKey,
      }),
    },
  );
  const json = await parseJson(res);
  if (!res.ok || json.ok !== true) {
    return {
      ok: false,
      status: res.status,
      error: String(json.error ?? "publish_failed"),
      code: typeof json.code === "string" ? json.code : undefined,
      issues: json.issues,
      message: typeof json.message === "string" ? json.message : undefined,
    };
  }
  return {
    ok: true,
    status: res.status,
    result: {
      publishOperationId: String(json.publishOperationId),
      publishedRevisionId: String(json.publishedRevisionId),
      packId: String(json.packId),
      documentIntegrity: String(json.documentIntegrity),
      packIntegrity: String(json.packIntegrity),
      packStoragePath: String(json.packStoragePath),
      sourceDraftVersion: Number(json.sourceDraftVersion),
      liveKind: String(json.liveKind ?? "NEVER_CONFIGURED"),
      liveInert: Boolean(json.liveInert),
      resumed: Boolean(json.resumed),
      verdict: (json.verdict as IntroPublishResultDto["verdict"]) ?? {
        adminToPack: "NOT_PROVEN",
        adminToApp: "NOT_PROVEN",
        setLive: false,
        appExposure: "NOT_AVAILABLE_IN_V1",
      },
      identityTrace: json.identityTrace as Record<string, unknown> | undefined,
      packSummary: json.packSummary as Record<string, unknown> | undefined,
    },
  };
}

export async function saveIntroDocumentApi(args: {
  documentId: string;
  expectedDraftVersion: number;
  document: IntroDocumentV1;
}): Promise<{
  ok: boolean;
  record?: IntroDocumentRecordDto;
  error?: string;
  code?: string;
  currentDraftVersion?: number;
  status: number;
  issues?: unknown;
}> {
  const res = await fetch(`/api/admin/intro/documents/${args.documentId}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      expectedDraftVersion: args.expectedDraftVersion,
      document: args.document,
    }),
  });
  const json = await parseJson(res);
  if (res.status === 409) {
    return {
      ok: false,
      status: 409,
      error: "conflict",
      code: String(json.code ?? "DRAFT_VERSION_CONFLICT"),
      currentDraftVersion:
        typeof json.currentDraftVersion === "number"
          ? json.currentDraftVersion
          : undefined,
    };
  }
  if (!res.ok || json.ok !== true) {
    return {
      ok: false,
      status: res.status,
      error: String(json.error ?? "save_failed"),
      issues: json.issues,
    };
  }
  return {
    ok: true,
    status: res.status,
    record: {
      documentId: String(json.documentId),
      title: String(json.title),
      draftVersion: Number(json.draftVersion),
      document: json.document as IntroDocumentV1,
      updatedAt: String(json.updatedAt),
      createdAt: String(json.createdAt),
    },
  };
}

export type IntroLiveAuthorityDto = {
  liveKind: string;
  publishedRevisionId: string | null;
  packId: string | null;
  setLiveAt: string | null;
  setLiveBy: string | null;
  disabledAt: string | null;
  disabledBy: string | null;
  updatedAt: string;
};

export async function getIntroLiveApi(): Promise<{
  ok: boolean;
  live?: IntroLiveAuthorityDto;
  authority?: {
    publishedRevisionId: string;
    packId: string;
    packIntegrity: string;
  } | null;
  error?: string;
}> {
  const res = await fetch("/api/admin/intro/live", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  const json = await parseJson(res);
  if (!res.ok || json.ok !== true) {
    return { ok: false, error: String(json.error ?? "live_read_failed") };
  }
  return {
    ok: true,
    live: json.live as IntroLiveAuthorityDto,
    authority:
      (json.authority as {
        publishedRevisionId: string;
        packId: string;
        packIntegrity: string;
      } | null) ?? null,
  };
}

/** Admin Set Live — changes revision offered to devices. Does NOT claim device download. */
export async function setIntroLiveApi(args: {
  publishedRevisionId: string;
  expectedLiveKind: string;
  expectedPublishedRevisionId: string | null;
}): Promise<{
  ok: boolean;
  live?: IntroLiveAuthorityDto;
  authority?: {
    publishedRevisionId: string;
    packId: string;
    packIntegrity: string;
  };
  error?: string;
  code?: string;
  message?: string;
  status: number;
}> {
  const res = await fetch("/api/admin/intro/live/set", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(args),
  });
  const json = await parseJson(res);
  if (!res.ok || json.ok !== true) {
    return {
      ok: false,
      status: res.status,
      error: String(json.error ?? "set_live_failed"),
      code: json.code ? String(json.code) : undefined,
      message: json.message ? String(json.message) : undefined,
    };
  }
  return {
    ok: true,
    status: res.status,
    live: json.live as IntroLiveAuthorityDto,
    authority: json.authority as {
      publishedRevisionId: string;
      packId: string;
      packIntegrity: string;
    },
  };
}
