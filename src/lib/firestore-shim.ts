// Compatibility layer: keep existing import path while using Firebase SDK APIs.
// Connection is controlled in `src/lib/firebase.ts` via VITE_ENABLE_FIREBASE.
export * from "firebase/firestore";
