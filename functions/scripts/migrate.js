/**
 * One-off data tidying, run by the server deploy after it deploys (safe to run
 * again: it only changes what still needs it). Uses the deploy's Google sign-in.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { migrateMix } from "../lib/cleanup.js";

initializeApp();
const r = await migrateMix(getFirestore());
console.log(`The Mix: ${r.tidied} recipes moved to private ratings and reports (${r.moved} of them to a new random id).`);
