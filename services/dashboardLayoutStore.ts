// File: services/dashboardLayoutStore.ts
// Role: persistance Firestore des layouts de dashboards utilisateur.
// Path : `users/{uid}/dashboards/{layoutId}`.
//
// Phase 1 : un layout "synthese" par utilisateur. Phase 3 ajoutera les 4
// sous-layouts du Tableau de bord, Phase 4 les layouts custom.
//
// Coordination read/write : on track les saves en cours via un Map module-level.
// Le load attend la fin d'un save concurrent sur le même path → évite la
// race condition "user mutate puis navigate puis revient" où le load lirait
// la version pré-mutation alors que le save était encore in-flight.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { firestoreDb } from "@/lib/firebase";
import type { DashboardLayout } from "@/types/dashboard";

// Tracker des saves en cours, keyé par `${userId}:${layoutId}`. Un load
// concurrent attend la fin de l'écriture pour ne pas voir l'ancienne
// version. Vidé naturellement quand chaque save resolve.
const pendingSaves = new Map<string, Promise<void>>();

function pendingKey(userId: string, layoutId: string): string {
  return `${userId}:${layoutId}`;
}

function dashboardDocRef(userId: string, layoutId: string) {
  return doc(firestoreDb, "users", userId, "dashboards", layoutId);
}

function dashboardsCollectionRef(userId: string) {
  return collection(firestoreDb, "users", userId, "dashboards");
}

export async function loadDashboardLayout(
  userId: string,
  layoutId: string
): Promise<DashboardLayout | null> {
  // Si un save est en cours pour ce path, on attend qu'il se termine avant
  // de lire — sinon on récupérerait l'ancienne version persistée (cas
  // typique : unmount d'un dashboard qui flush son save, puis remount qui
  // déclenche un load alors que l'écriture n'est pas encore confirmée).
  const pending = pendingSaves.get(pendingKey(userId, layoutId));
  if (pending) {
    try {
      await pending;
    } catch {
      // Erreur ignorée — le save a sa propre gestion. On lit ce qui est en
      // base actuellement.
    }
  }

  const snap = await getDoc(dashboardDocRef(userId, layoutId));
  if (!snap.exists()) return null;
  const data = snap.data();
  // On ne renvoie que les champs typés — Firestore peut avoir ajouté des
  // champs internes (createdAt en serverTimestamp, etc.).
  return {
    id: layoutId,
    name: data.name,
    constrainedToCategory: data.constrainedToCategory,
    widgets: Array.isArray(data.widgets) ? data.widgets : [],
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt
  };
}

export async function saveDashboardLayout(
  userId: string,
  layout: DashboardLayout
): Promise<void> {
  const ref = dashboardDocRef(userId, layout.id);
  const key = pendingKey(userId, layout.id);
  // setDoc avec merge:true → upsert : crée si absent, met à jour sinon.
  const promise = setDoc(
    ref,
    {
      name: layout.name ?? null,
      constrainedToCategory: layout.constrainedToCategory ?? null,
      widgets: layout.widgets,
      updatedAt: serverTimestamp(),
      // createdAt n'est posé qu'à la première écriture grâce à merge:true
      // — Firestore garde l'existant si déjà présent. À la première écriture
      // serverTimestamp() s'applique.
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
  // On expose la promesse aux loads concurrents avant d'await — le load
  // attendra ainsi la fin de cette écriture avant de relire.
  pendingSaves.set(key, promise);
  try {
    await promise;
  } finally {
    // Cleanup uniquement si c'est encore notre promesse — un save plus
    // récent (autre patch) peut nous avoir remplacés entre temps.
    if (pendingSaves.get(key) === promise) {
      pendingSaves.delete(key);
    }
  }
}

export async function deleteDashboardLayout(
  userId: string,
  layoutId: string
): Promise<void> {
  await deleteDoc(dashboardDocRef(userId, layoutId));
}

// Met à jour uniquement le `name` d'un layout sans toucher au reste (widgets,
// constrainedToCategory). Sert au renommage Phase 4 sans risque d'écraser le
// contenu via un setDoc complet.
export async function renameDashboardLayout(
  userId: string,
  layoutId: string,
  newName: string
): Promise<void> {
  await setDoc(
    dashboardDocRef(userId, layoutId),
    {
      name: newName,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function listUserDashboardLayouts(
  userId: string
): Promise<DashboardLayout[]> {
  const snap = await getDocs(dashboardsCollectionRef(userId));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name,
      constrainedToCategory: data.constrainedToCategory,
      widgets: Array.isArray(data.widgets) ? data.widgets : [],
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt
    } satisfies DashboardLayout;
  });
}
