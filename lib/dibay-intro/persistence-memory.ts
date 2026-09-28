import {
  documentsSemanticallyEqual,
  parseDibayIntroDocument,
  type DibayIntroDocument,
} from "@/lib/dibay-intro/document";
import { documentChecksum } from "@/lib/dibay-intro/checksum";
import { validateDocumentForPublish } from "@/lib/dibay-intro/publish-validate";
import { resolveIntroOperatorLifecycle, type IntroOperatorLifecycle } from "@/lib/dibay-intro/lifecycle";

export type MemoryIntroRecord = {
  id: string;
  title: string;
  document: DibayIntroDocument;
  mutations: number;
  publishedRevisionId: string | null;
  publishedChecksum: string | null;
  publishedDocument: DibayIntroDocument | null;
  liveRevisionId: string | null;
  lifecycle: IntroOperatorLifecycle;
};

type Revision = {
  id: string;
  introId: string;
  document: DibayIntroDocument;
  checksum: string;
};

export class DibayIntroMemoryAuthority {
  mutations = 0;
  private intros = new Map<string, MemoryIntroRecord>();
  private revisions = new Map<string, Revision>();
  private live: { singleton: true; introId: string; revisionId: string } | null = null;

  create(id: string, title: string, document: DibayIntroDocument): MemoryIntroRecord {
    const parsed = parseDibayIntroDocument(document);
    if (!parsed.ok) throw new Error("invalid_document");
    const record: MemoryIntroRecord = {
      id,
      title,
      document: parsed.document,
      mutations: 0,
      publishedRevisionId: null,
      publishedChecksum: null,
      publishedDocument: null,
      liveRevisionId: null,
      lifecycle: "draft",
    };
    this.intros.set(id, record);
    return this.snapshot(id);
  }

  save(id: string, title: string, document: DibayIntroDocument): MemoryIntroRecord {
    const parsed = parseDibayIntroDocument(document);
    if (!parsed.ok) throw new Error("invalid_document");
    const current = this.intros.get(id);
    if (!current) throw new Error("not_found");
    this.mutations += 1;
    current.mutations += 1;
    current.title = title;
    current.document = parsed.document;
    this.refreshLifecycle(current);
    return this.snapshot(id);
  }

  load(id: string): MemoryIntroRecord {
    return this.snapshot(id);
  }

  publish(id: string, readyMedia: Set<string>): { revisionId: string; checksum: string } {
    const current = this.intros.get(id);
    if (!current) throw new Error("not_found");
    const validated = validateDocumentForPublish(current.document, readyMedia);
    if (!validated.ok) throw new Error("publish_invalid");
    const checksum = documentChecksum(validated.document);
    const revisionId = `rev-${checksum.slice(0, 12)}`;
    const stored: Revision = {
      id: revisionId,
      introId: id,
      document: structuredClone(validated.document),
      checksum,
    };
    this.revisions.set(revisionId, stored);
    current.publishedRevisionId = revisionId;
    current.publishedChecksum = checksum;
    current.publishedDocument = structuredClone(validated.document);
    this.refreshLifecycle(current);
    return { revisionId, checksum };
  }

  setLive(introId: string): { revisionId: string } {
    const current = this.intros.get(introId);
    if (!current?.publishedRevisionId) throw new Error("not_published");
    this.live = { singleton: true, introId, revisionId: current.publishedRevisionId };
    for (const record of this.intros.values()) this.refreshLifecycle(record);
    return { revisionId: current.publishedRevisionId };
  }

  livePointer(): { singleton: true; introId: string; revisionId: string } | null {
    return this.live ? { ...this.live } : null;
  }

  publishedUnchanged(id: string): boolean {
    const current = this.intros.get(id);
    if (!current?.publishedDocument || !current.publishedChecksum) return false;
    const stored = this.revisions.get(current.publishedRevisionId ?? "");
    if (!stored) return false;
    return stored.checksum === current.publishedChecksum && documentsSemanticallyEqual(stored.document, current.publishedDocument);
  }

  private refreshLifecycle(record: MemoryIntroRecord): void {
    record.liveRevisionId = this.live?.revisionId ?? null;
    record.lifecycle = resolveIntroOperatorLifecycle({
      hasDraft: true,
      publishedRevisionId: record.publishedRevisionId,
      liveRevisionId: this.live?.revisionId ?? null,
      liveIntroId: this.live?.introId ?? null,
      introId: record.id,
    });
  }

  private snapshot(id: string): MemoryIntroRecord {
    const current = this.intros.get(id);
    if (!current) throw new Error("not_found");
    return structuredClone(current);
  }
}

export function saveEqualityChain(working: DibayIntroDocument, request: DibayIntroDocument, stored: DibayIntroDocument, fetched: DibayIntroDocument, rehydrated: DibayIntroDocument): boolean {
  return (
    documentsSemanticallyEqual(working, request) &&
    documentsSemanticallyEqual(request, stored) &&
    documentsSemanticallyEqual(stored, fetched) &&
    documentsSemanticallyEqual(fetched, rehydrated)
  );
}
