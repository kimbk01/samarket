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
