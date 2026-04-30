// File: lib/ai/chatStore.test.ts
// Role: tests unitaires du chatStore en mockant entièrement Firestore admin.
// On vérifie le format des documents écrits (titre tronqué, preview, count)
// et les transitions create → addMessage → list → get.

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  addMock,
  getMock,
  updateMock,
  docMock,
  collectionConvMock,
  doc1Mock,
  collectionChatsMock,
  orderByMock,
  limitMock,
  getListMock,
  firestoreMock,
} = vi.hoisted(() => {
  const addMock = vi.fn();
  const getMock = vi.fn();
  const updateMock = vi.fn();
  const docMock = vi.fn();
  const orderByMock = vi.fn();
  const limitMock = vi.fn();
  const getListMock = vi.fn();
  const collectionConvMock = {
    add: addMock,
    doc: docMock,
    orderBy: orderByMock,
  };
  const doc1Mock = {
    collection: vi.fn(),
  };
  const collectionChatsMock = {
    doc: vi.fn(),
  };
  const firestoreMock = {
    collection: vi.fn(),
  };
  return {
    addMock,
    getMock,
    updateMock,
    docMock,
    collectionConvMock,
    doc1Mock,
    collectionChatsMock,
    orderByMock,
    limitMock,
    getListMock,
    firestoreMock,
  };
});

// Mock Timestamp / FieldValue : on stub les méthodes statiques qu'on utilise
// (Timestamp.now, FieldValue.arrayUnion/increment) en mode "comportement
// observable" — l'objet retourné est opaque, mais on peut le comparer.
vi.mock("firebase-admin/firestore", () => {
  class FakeTimestamp {
    constructor(public millis: number) {}
    toMillis() {
      return this.millis;
    }
    static now() {
      return new FakeTimestamp(1_700_000_000_000);
    }
  }
  return {
    Timestamp: FakeTimestamp,
    FieldValue: {
      arrayUnion: (...items: unknown[]) => ({ __op: "arrayUnion", items }),
      increment: (n: number) => ({ __op: "increment", value: n }),
      serverTimestamp: () => ({ __op: "serverTimestamp" }),
    },
  };
});

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getFirebaseAdminFirestore: () => firestoreMock,
}));

import {
  addMessage,
  createConversation,
  getConversation,
  listConversations,
} from "@/lib/ai/chatStore";
import { Timestamp } from "firebase-admin/firestore";

// Helper : la classe `Timestamp` réelle exige (seconds, nanoseconds) mais
// notre mock n'attend qu'un seul argument (millis). On caste pour faire
// taire le compilateur tout en gardant le runtime conforme au mock.
const ts = (millis: number): Timestamp =>
  new (Timestamp as unknown as new (m: number) => Timestamp)(millis);

describe("chatStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMock.collection.mockReturnValue(collectionChatsMock);
    collectionChatsMock.doc.mockReturnValue(doc1Mock);
    doc1Mock.collection.mockReturnValue(collectionConvMock);
    docMock.mockReturnValue({ get: getMock, update: updateMock });
    orderByMock.mockReturnValue({ limit: limitMock });
    limitMock.mockReturnValue({ get: getListMock });
  });

  describe("createConversation", () => {
    it("écrit le doc avec title (= question tronquée), 2 messages, count=2 et preview", async () => {
      addMock.mockResolvedValueOnce({ id: "conv-1" });

      const longQuestion =
        "Pourquoi mon EBITDA a chuté ce trimestre alors que mon chiffre d'affaires est plutôt en hausse ? Que dois-je faire ?";
      const longAnswer =
        "Votre EBITDA s'établit à -50 000 €. Cela vient principalement de la masse salariale qui a augmenté plus vite que la VA. Trois leviers : renégocier les fournisseurs, étaler les charges fixes, et ajuster la grille tarifaire de 3-5%.";

      const conv = await createConversation({
        userId: "user-1",
        kpiId: "ebitda",
        question: longQuestion,
        answer: longAnswer,
      });

      expect(firestoreMock.collection).toHaveBeenCalledWith("chats");
      expect(collectionChatsMock.doc).toHaveBeenCalledWith("user-1");
      expect(doc1Mock.collection).toHaveBeenCalledWith("conversations");

      expect(addMock).toHaveBeenCalledTimes(1);
      const written = addMock.mock.calls[0]![0]!;
      expect(written.kpiId).toBe("ebitda");
      expect(written.messageCount).toBe(2);
      expect(written.messages).toHaveLength(2);
      expect(written.messages[0].role).toBe("user");
      expect(written.messages[1].role).toBe("assistant");
      // Le titre est tronqué (~80 chars max) et termine par … si débordement
      expect(written.title.length).toBeLessThanOrEqual(81);
      expect(written.title.endsWith("…") || written.title === longQuestion.trim()).toBe(true);
      // Preview tronquée également
      expect(written.lastAnswerPreview).toBeDefined();
      expect(written.lastAnswerPreview!.length).toBeLessThanOrEqual(141);

      expect(conv.id).toBe("conv-1");
      expect(conv.messageCount).toBe(2);
      expect(conv.kpiId).toBe("ebitda");
    });

    it("accepte un kpiId null (chat libre sans focus)", async () => {
      addMock.mockResolvedValueOnce({ id: "conv-2" });
      const conv = await createConversation({
        userId: "user-1",
        kpiId: null,
        question: "Bonjour",
        answer: "Bonjour, en quoi puis-je vous aider ?",
      });
      expect(conv.kpiId).toBeNull();
      expect(addMock.mock.calls[0]![0].kpiId).toBeNull();
    });
  });

  describe("addMessage", () => {
    it("append un tour à une conversation existante (arrayUnion + increment)", async () => {
      getMock.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          messageCount: 4,
          kpiId: "ebitda",
        }),
      });
      updateMock.mockResolvedValueOnce(undefined);

      await addMessage({
        userId: "user-1",
        conversationId: "conv-1",
        question: "Et sur le BFR ?",
        answer: "Votre BFR est sain à 12 jours.",
      });

      expect(docMock).toHaveBeenCalledWith("conv-1");
      expect(updateMock).toHaveBeenCalledTimes(1);
      const update = updateMock.mock.calls[0]![0]!;
      expect(update.messages).toMatchObject({ __op: "arrayUnion" });
      expect(update.messages.items).toHaveLength(2);
      expect(update.messageCount).toMatchObject({ __op: "increment", value: 2 });
      expect(update.lastAnswerPreview).toContain("BFR");
    });

    it("rejette si la conversation n'existe pas", async () => {
      getMock.mockResolvedValueOnce({ exists: false });
      await expect(
        addMessage({
          userId: "user-1",
          conversationId: "nope",
          question: "x",
          answer: "y",
        })
      ).rejects.toThrow(/introuvable/i);
    });

    it("rejette si la conversation a atteint 100 messages", async () => {
      getMock.mockResolvedValueOnce({
        exists: true,
        data: () => ({ messageCount: 100 }),
      });
      await expect(
        addMessage({
          userId: "user-1",
          conversationId: "conv-1",
          question: "encore ?",
          answer: "non",
        })
      ).rejects.toThrow(/pleine|100/i);
    });
  });

  describe("listConversations", () => {
    it("retourne les conversations triées par lastMessageAt desc", async () => {
      getListMock.mockResolvedValueOnce({
        docs: [
          {
            id: "conv-1",
            data: () => ({
              kpiId: "ebitda",
              createdAt: ts(1000),
              lastMessageAt: ts(5000),
              title: "Pourquoi mon EBITDA est négatif ?",
              messages: [],
              messageCount: 4,
              lastAnswerPreview: "Votre EBITDA…",
            }),
          },
        ],
      });

      const list = await listConversations("user-1");
      expect(orderByMock).toHaveBeenCalledWith("lastMessageAt", "desc");
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe("conv-1");
      expect(list[0]!.kpiId).toBe("ebitda");
      expect(list[0]!.messageCount).toBe(4);
      expect(list[0]!.lastAnswerPreview).toBe("Votre EBITDA…");
    });
  });

  describe("getConversation", () => {
    it("retourne null si le doc n'existe pas", async () => {
      getMock.mockResolvedValueOnce({ exists: false });
      const conv = await getConversation("user-1", "missing");
      expect(conv).toBeNull();
    });

    it("retourne la conversation avec messages convertis (timestamp en ms)", async () => {
      getMock.mockResolvedValueOnce({
        exists: true,
        id: "conv-1",
        data: () => ({
          kpiId: "ebitda",
          createdAt: ts(1000),
          lastMessageAt: ts(5000),
          title: "T",
          messages: [
            { role: "user", content: "Q", timestamp: ts(1000) },
            { role: "assistant", content: "A", timestamp: ts(2000) },
          ],
          messageCount: 2,
          lastAnswerPreview: "A",
        }),
      });

      const conv = await getConversation("user-1", "conv-1");
      expect(conv).not.toBeNull();
      expect(conv!.messages).toHaveLength(2);
      expect(conv!.messages[0]!.timestamp).toBe(1000);
      expect(conv!.messages[1]!.role).toBe("assistant");
    });
  });
});
