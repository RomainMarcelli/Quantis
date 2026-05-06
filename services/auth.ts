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
import {
  AUTH_SESSION_MAX_AGE_MS,
  computeSessionLifetimeState,
  parseSessionStartedAt
} from "@/lib/auth/sessionLifetime";
import type { AuthenticatedUser, LoginCredentials, RegisterCredentials } from "@/types/auth";

const auth = firebaseAuth;
const SESSION_STARTED_AT_STORAGE_KEY = "quantis.auth.sessionStartedAt";
const USE_E2E_MOCK_AUTH = process.env.NEXT_PUBLIC_E2E_MOCK_AUTH === "1";
const E2E_AUTH_STORAGE_KEY = "quantis.e2e.mockAuthUser";
const E2E_AUTH_TOKEN = "quantis-e2e-token";

let sessionAutoLogoutTimer: number | null = null;
let sessionLogoutInProgress = false;

export type AuthStateListener = (user: AuthenticatedUser | null) => void;

export interface AuthGateway {
  signIn(credentials: LoginCredentials): Promise<AuthenticatedUser>;
  register(credentials: RegisterCredentials): Promise<AuthenticatedUser>;
  signOut(): Promise<void>;
  deleteCurrentUser(): Promise<void>;
  getIdToken(forceRefresh?: boolean): Promise<string | null>;
  sendPasswordReset(email: string): Promise<void>;
  verifyPasswordResetCode(oobCode: string): Promise<string>;
  confirmPasswordReset(oobCode: string, newPassword: string): Promise<void>;
  getCurrentUser(): AuthenticatedUser | null;
  subscribe(listener: AuthStateListener): () => void;
}

const realFirebaseAuthGateway: AuthGateway = {
  async signIn(credentials) {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      credentials.email,
      credentials.password
    );

    if (!userCredential.user.emailVerified) {
      await signOut(auth);
      clearSessionLifetimeContext();
      const verificationError = new Error("Email not verified");
      (verificationError as Error & { code: string }).code = "auth/email-not-verified";
      throw verificationError;
    }

    ensureSessionStartedAt();
    scheduleSessionAutoLogout();
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

    ensureSessionStartedAt();
    scheduleSessionAutoLogout();
    return toAuthenticatedUser(userCredential.user);
  },

  async signOut() {
    await signOut(auth);
    clearSessionLifetimeContext();
  },

  async deleteCurrentUser() {
    if (!auth.currentUser) {
      return;
    }
    await deleteUser(auth.currentUser);
  },

  async getIdToken(forceRefresh = false) {
    if (!auth.currentUser) {
      return null;
    }
    return auth.currentUser.getIdToken(forceRefresh);
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
    if (!auth.currentUser) {
      return null;
    }

    if (isSessionExpired()) {
      void forceSessionLogout();
      return null;
    }

    ensureSessionStartedAt();
    scheduleSessionAutoLogout();
    return toAuthenticatedUser(auth.currentUser);
  },

  subscribe(listener) {
    return onAuthStateChanged(auth, (user) => {
      void handleAuthStateChange(user, listener);
    });
  }
};

async function handleAuthStateChange(
  user: User | null,
  listener: AuthStateListener
): Promise<void> {
  if (!user) {
    clearSessionLifetimeContext();
    listener(null);
    return;
  }

  if (isSessionExpired()) {
    listener(null);
    await forceSessionLogout();
    return;
  }

  ensureSessionStartedAt();
  scheduleSessionAutoLogout();
  listener(toAuthenticatedUser(user));
}

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified
  };
}

function getStoredSessionStartedAt(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parseSessionStartedAt(window.localStorage.getItem(SESSION_STARTED_AT_STORAGE_KEY));
  } catch {
    return null;
  }
}

function setStoredSessionStartedAt(timestamp: number): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SESSION_STARTED_AT_STORAGE_KEY, String(timestamp));
  } catch {
    // fail-open: on ne bloque jamais l'auth pour une erreur de storage.
  }
}

function clearStoredSessionStartedAt(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(SESSION_STARTED_AT_STORAGE_KEY);
  } catch {
    // fail-open
  }
}

function ensureSessionStartedAt(): number {
  const stored = getStoredSessionStartedAt();
  if (stored !== null) {
    return stored;
  }

  const now = Date.now();
  setStoredSessionStartedAt(now);
  return now;
}

function isSessionExpired(now: number = Date.now()): boolean {
  const startedAt = getStoredSessionStartedAt();
  return computeSessionLifetimeState(startedAt, now, AUTH_SESSION_MAX_AGE_MS).isExpired;
}

function scheduleSessionAutoLogout(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (sessionAutoLogoutTimer) {
    clearTimeout(sessionAutoLogoutTimer);
    sessionAutoLogoutTimer = null;
  }

  const startedAt = ensureSessionStartedAt();
  const lifetime = computeSessionLifetimeState(startedAt, Date.now(), AUTH_SESSION_MAX_AGE_MS);

  if (lifetime.isExpired) {
    void forceSessionLogout();
    return;
  }

  sessionAutoLogoutTimer = window.setTimeout(() => {
    void forceSessionLogout();
  }, lifetime.remainingMs + 300);
}

async function forceSessionLogout(): Promise<void> {
  if (sessionLogoutInProgress) {
    return;
  }

  sessionLogoutInProgress = true;
  try {
    await signOut(auth);
  } catch {
    // fail-open
  } finally {
    clearSessionLifetimeContext();
    sessionLogoutInProgress = false;
  }
}

function clearSessionLifetimeContext(): void {
  if (sessionAutoLogoutTimer) {
    clearTimeout(sessionAutoLogoutTimer);
    sessionAutoLogoutTimer = null;
  }

  clearStoredSessionStartedAt();
}

const e2eAuthListeners = new Set<AuthStateListener>();
let e2eCurrentUser: AuthenticatedUser | null = readE2eStoredUser();

export const firebaseAuthGateway: AuthGateway = USE_E2E_MOCK_AUTH
  ? createE2eMockAuthGateway()
  : realFirebaseAuthGateway;

function createE2eMockAuthGateway(): AuthGateway {
  return {
    async signIn(credentials) {
      const email = credentials.email.trim().toLowerCase();
      const password = credentials.password.trim();

      if (!email || !password) {
        throw withFirebaseLikeCode("auth/invalid-credential", "Email ou mot de passe invalide.");
      }

      const [displayName = "Utilisateur"] = email.split("@");
      e2eCurrentUser = {
        uid: `e2e-${displayName || "user"}`,
        email,
        displayName,
        emailVerified: true
      };
      persistE2eUser(e2eCurrentUser);
      notifyE2eAuthListeners();
      return e2eCurrentUser;
    },

    async register(credentials) {
      const email = credentials.email.trim().toLowerCase();
      const firstName = credentials.firstName.trim();
      const lastName = credentials.lastName.trim();
      const displayName = `${firstName} ${lastName}`.trim() || email.split("@")[0] || "Utilisateur";

      e2eCurrentUser = {
        uid: `e2e-${displayName.replace(/\s+/g, "-").toLowerCase()}`,
        email,
        displayName,
        emailVerified: false
      };
      persistE2eUser(e2eCurrentUser);
      notifyE2eAuthListeners();
      return e2eCurrentUser;
    },

    async signOut() {
      e2eCurrentUser = null;
      clearSessionLifetimeContext();
      persistE2eUser(null);
      notifyE2eAuthListeners();
    },

    async deleteCurrentUser() {
      e2eCurrentUser = null;
      persistE2eUser(null);
      notifyE2eAuthListeners();
    },

    async getIdToken() {
      return e2eCurrentUser ? E2E_AUTH_TOKEN : null;
    },

    async sendPasswordReset() {
      return;
    },

    async verifyPasswordResetCode() {
      return "mocked-user@quantis.test";
    },

    async confirmPasswordReset() {
      return;
    },

    getCurrentUser() {
      if (!e2eCurrentUser) {
        e2eCurrentUser = readE2eStoredUser();
      }
      return e2eCurrentUser;
    },

    subscribe(listener) {
      e2eAuthListeners.add(listener);
      listener(e2eCurrentUser);
      return () => {
        e2eAuthListeners.delete(listener);
      };
    }
  };
}

function notifyE2eAuthListeners(): void {
  for (const listener of e2eAuthListeners) {
    listener(e2eCurrentUser);
  }
}

function readE2eStoredUser(): AuthenticatedUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(E2E_AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<AuthenticatedUser>;
    if (typeof parsed.uid !== "string" || !parsed.uid) {
      return null;
    }
    if (typeof parsed.email !== "string" || !parsed.email) {
      return null;
    }

    return {
      uid: parsed.uid,
      email: parsed.email,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : null,
      emailVerified: Boolean(parsed.emailVerified)
    };
  } catch {
    return null;
  }
}

function persistE2eUser(user: AuthenticatedUser | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!user) {
      window.localStorage.removeItem(E2E_AUTH_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(E2E_AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // non bloquant
  }
}

function withFirebaseLikeCode(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
