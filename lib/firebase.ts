import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD8YL5LaWei0KeCwnk-z2oPjN2E405xnGw",
  authDomain: "quantis-489d2.firebaseapp.com",
  projectId: "quantis-489d2",
  storageBucket: "quantis-489d2.firebasestorage.app",
  messagingSenderId: "454735267839",
  appId: "1:454735267839:web:c53e2627b67fa0e60409ca",
  measurementId: "G-QT3VFGNV2T"
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestoreDb = getFirestore(firebaseApp);
export { firebaseConfig };
