import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey);

// O chat global depende do Realtime Database, que exige a URL do banco
export const isRealtimeDatabaseConfigured =
  isFirebaseConfigured && Boolean(firebaseConfig.databaseURL);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let rtdb = null;
if (isRealtimeDatabaseConfigured) {
  try {
    rtdb = getDatabase(app);
  } catch (error) {
    console.error("Não foi possível iniciar o Realtime Database.", error);
    rtdb = null;
  }
}

export { app, auth, db, rtdb };
