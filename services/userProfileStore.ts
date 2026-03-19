import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { firestoreDb } from "@/lib/firebase";
import type { RegisterProfilePayload } from "@/lib/auth/register";

export async function saveUserProfile(userId: string, profile: RegisterProfilePayload): Promise<void> {
  const ref = doc(firestoreDb, "users", userId);

  await setDoc(
    ref,
    {
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      emailVerified: false
    },
    { merge: true }
  );
}

export async function markUserEmailAsVerified(userId: string): Promise<void> {
  const ref = doc(firestoreDb, "users", userId);
  await updateDoc(ref, {
    emailVerified: true,
    updatedAt: serverTimestamp()
  });
}
