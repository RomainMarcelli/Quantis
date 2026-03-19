import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import { firebaseApp } from "@/lib/firebase";
import type { AuthenticatedUser, LoginCredentials } from "@/types/auth";

const auth = getAuth(firebaseApp);

export type AuthStateListener = (user: AuthenticatedUser | null) => void;

export interface AuthGateway {
  signIn(credentials: LoginCredentials): Promise<AuthenticatedUser>;
  signOut(): Promise<void>;
  getCurrentUser(): AuthenticatedUser | null;
  subscribe(listener: AuthStateListener): () => void;
}

export const firebaseAuthGateway: AuthGateway = {
  async signIn(credentials) {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      credentials.email,
      credentials.password
    );

    return toAuthenticatedUser(userCredential.user);
  },

  async signOut() {
    await signOut(auth);
  },

  getCurrentUser() {
    return auth.currentUser ? toAuthenticatedUser(auth.currentUser) : null;
  },

  subscribe(listener) {
    return onAuthStateChanged(auth, (user) => {
      listener(user ? toAuthenticatedUser(user) : null);
    });
  }
};

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    uid: user.uid,
    email: user.email
  };
}
