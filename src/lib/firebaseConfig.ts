import type { FirebaseOptions } from "firebase/app";

/**
 * The Firebase project the app backs up to. These values identify the
 * project and are meant to be public; what protects each person's recipes
 * is the Firestore security rules (firestore.rules), which only let a
 * signed-in user read and write their own data.
 *
 * null = cloud backup not set up yet (the app works fully without it).
 */
export const firebaseConfig: FirebaseOptions | null = import.meta.env.VITE_FIREBASE_EMULATOR
  ? { apiKey: "demo-key", authDomain: "demo-recipe-builder.firebaseapp.com", projectId: "demo-recipe-builder", appId: "demo" }
  : null;
