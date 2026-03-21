// services/auth.ts
// Implante la passerelle d'authentification Firebase cote frontend.
import {
  confirmPasswordReset as firebaseConfirmPasswordReset,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
  type User
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import type { AuthenticatedUser, LoginCredentials, RegisterCredentials } from "@/types/auth";

const auth = firebaseAuth;

export type AuthStateListener = (user: AuthenticatedUser | null) => void;

export interface AuthGateway {
  signIn(credentials: LoginCredentials): Promise<AuthenticatedUser>;
  register(credentials: RegisterCredentials): Promise<AuthenticatedUser>;
  signOut(): Promise<void>;
  deleteCurrentUser(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  verifyPasswordResetCode(oobCode: string): Promise<string>;
  confirmPasswordReset(oobCode: string, newPassword: string): Promise<void>;
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

    if (!userCredential.user.emailVerified) {
      await signOut(auth);
      const verificationError = new Error("Email not verified");
      (verificationError as Error & { code: string }).code = "auth/email-not-verified";
      throw verificationError;
    }

    return toAuthenticatedUser(userCredential.user);
  },

  async register(credentials) {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      credentials.email,
      credentials.password
    );

    const displayName = `${credentials.firstName.trim()} ${credentials.lastName.trim()}`.trim();

    if (displayName) {
      await updateProfile(userCredential.user, {
        displayName
      });
    }

    // Envoi natif Firebase de l'email de verification.
    await sendEmailVerification(userCredential.user);

    return toAuthenticatedUser(userCredential.user);
  },

  async signOut() {
    await signOut(auth);
  },

  async deleteCurrentUser() {
    if (!auth.currentUser) {
      return;
    }
    await deleteUser(auth.currentUser);
  },

  async sendPasswordReset(email) {
    const trimmedEmail = email.trim();

    // On demande a Firebase de rediriger vers notre ecran applicatif apres
    // validation du lien, pour garder un parcours UX coherent.
    const continueUrl =
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;

    if (continueUrl) {
      await firebaseSendPasswordResetEmail(auth, trimmedEmail, {
        url: continueUrl
      });
      return;
    }

    await firebaseSendPasswordResetEmail(auth, trimmedEmail);
  },

  async verifyPasswordResetCode(oobCode) {
    return firebaseVerifyPasswordResetCode(auth, oobCode);
  },

  async confirmPasswordReset(oobCode, newPassword) {
    await firebaseConfirmPasswordReset(auth, oobCode, newPassword);
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
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified
  };
}
