import type { FirebaseOptions } from "firebase/app";

/**
 * The Firebase project the app backs up to (free Spark plan). These values
 * identify the project and are meant to be public; what protects each
 * person's recipes is the Firestore security rules (firestore.rules), which
 * only let a signed-in user read and write their own data.
 *
 * Tests and local development use the Firebase emulator instead.
 */
const PROJECT: FirebaseOptions = {
  apiKey: "AIzaSyAkXeQWyBlZ2xs8FAP4yHLFjqgiFrvu8Yc",
  authDomain: "recipe-relief.firebaseapp.com",
  projectId: "recipe-relief",
  storageBucket: "recipe-relief.firebasestorage.app",
  messagingSenderId: "902652553131",
  appId: "1:902652553131:web:9c474941b8223123e854ee",
};

/** The AI relay (Cloud Function "ai"): AI requests go here with the app's own Anthropic key. */
export const AI_URL = import.meta.env.VITE_FIREBASE_EMULATOR
  ? "http://127.0.0.1:5001/demo-recipe-builder/us-central1/ai"
  : "https://us-central1-recipe-relief.cloudfunctions.net/ai";

export const firebaseConfig: FirebaseOptions | null = import.meta.env.VITE_FIREBASE_EMULATOR
  ? { apiKey: "demo-key", authDomain: "demo-recipe-builder.firebaseapp.com", projectId: "demo-recipe-builder", appId: "demo" }
  : PROJECT;
