import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCTtv2kzdp0xEiolJzj11rhPaR-odEyW6A",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "birianicom-d33d6.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "birianicom-d33d6",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "birianicom-d33d6.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1009703148026",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1009703148026:web:c7f4e295077f27119bec43",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
