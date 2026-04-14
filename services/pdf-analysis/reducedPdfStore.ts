// Store mémoire éphémère pour les PDF réduits par pdfPageExtractor.
// Le requestId (UUID côté client) sert de clé. TTL 10 min pour éviter
// les fuites mémoire si l'utilisateur ne clique jamais sur "Voir le PDF".

type StoreEntry = {
  buffer: Buffer;
  expiresAt: number;
};

const TTL_MS = 10 * 60 * 1000;

const store = new Map<string, StoreEntry>();

export function storeReducedPdf(requestId: string, buffer: Buffer): void {
  store.set(requestId, {
    buffer,
    expiresAt: Date.now() + TTL_MS
  });
}

export function getReducedPdf(requestId: string): Buffer | null {
  const entry = store.get(requestId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(requestId);
    return null;
  }
  return entry.buffer;
}

export function deleteReducedPdf(requestId: string): void {
  store.delete(requestId);
}

export function __clearReducedPdfStoreForTests(): void {
  store.clear();
}
