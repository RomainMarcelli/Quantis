// File: services/folderStore.ts
// Role: gere la persistance Firestore des dossiers utilisateur (creation, lecture, renommage, suppression).
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { firestoreDb } from "@/lib/firebase";

const COLLECTION = "folders";

export type FolderRecord = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
};

export async function listUserFolders(userId: string): Promise<FolderRecord[]> {
  const collectionRef = collection(firestoreDb, COLLECTION);
  const snapshot = await getDocs(query(collectionRef, where("userId", "==", userId)));
  const folders = snapshot.docs.map((docSnapshot) => toFolderRecord(docSnapshot.id, docSnapshot.data()));
  return folders.sort((left, right) => left.name.localeCompare(right.name, "fr"));
}

export async function createUserFolder(userId: string, folderName: string): Promise<FolderRecord | null> {
  const normalizedName = folderName.trim();
  if (!normalizedName) {
    return null;
  }

  const existingFolders = await listUserFolders(userId);
  const alreadyExists = existingFolders.some((folder) =>
    isSameFolderName(folder.name, normalizedName)
  );
  if (alreadyExists) {
    return existingFolders.find((folder) => isSameFolderName(folder.name, normalizedName)) ?? null;
  }

  const docRef = await addDoc(collection(firestoreDb, COLLECTION), {
    userId,
    name: normalizedName,
    nameLower: normalizedName.toLowerCase(),
    createdAt: serverTimestamp()
  });

  return {
    id: docRef.id,
    userId,
    name: normalizedName,
    createdAt: new Date().toISOString()
  };
}

export async function renameUserFoldersByName(
  userId: string,
  previousFolderName: string,
  nextFolderName: string
): Promise<number> {
  const normalizedNextName = nextFolderName.trim();
  if (!normalizedNextName) {
    return 0;
  }

  const foldersSnapshot = await getDocs(query(collection(firestoreDb, COLLECTION), where("userId", "==", userId)));
  const foldersToRename = foldersSnapshot.docs.filter((docSnapshot) => {
    const name = String(docSnapshot.data().name ?? "");
    return isSameFolderName(name, previousFolderName);
  });

  if (!foldersToRename.length) {
    await createUserFolder(userId, normalizedNextName);
    return 0;
  }

  await Promise.all(
    foldersToRename.map((docSnapshot) =>
      updateDoc(docSnapshot.ref, {
        name: normalizedNextName,
        nameLower: normalizedNextName.toLowerCase()
      })
    )
  );
  return foldersToRename.length;
}

export async function deleteUserFoldersByName(userId: string, folderName: string): Promise<number> {
  const foldersSnapshot = await getDocs(query(collection(firestoreDb, COLLECTION), where("userId", "==", userId)));
  const foldersToDelete = foldersSnapshot.docs.filter((docSnapshot) => {
    const name = String(docSnapshot.data().name ?? "");
    return isSameFolderName(name, folderName);
  });

  await Promise.all(foldersToDelete.map((docSnapshot) => deleteDoc(docSnapshot.ref)));
  return foldersToDelete.length;
}

export async function deleteUserFolders(userId: string): Promise<number> {
  const foldersSnapshot = await getDocs(query(collection(firestoreDb, COLLECTION), where("userId", "==", userId)));
  await Promise.all(foldersSnapshot.docs.map((docSnapshot) => deleteDoc(docSnapshot.ref)));
  return foldersSnapshot.docs.length;
}

function toFolderRecord(id: string, data: Record<string, unknown>): FolderRecord {
  const createdAt =
    data.createdAt instanceof Timestamp
      ? data.createdAt.toDate().toISOString()
      : new Date().toISOString();

  return {
    id,
    userId: String(data.userId ?? ""),
    name: String(data.name ?? ""),
    createdAt
  };
}

function isSameFolderName(leftFolderName: string, rightFolderName: string): boolean {
  return leftFolderName.trim().toLowerCase() === rightFolderName.trim().toLowerCase();
}
