import { initializeApp } from "firebase/app";
import {
	getFirestore,
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
	apiKey: "AIzaSyD9M4M_0I2LHyHwwBKv5tFiBZarq9lFC3U",
	authDomain: "sentiment-pharma.firebaseapp.com",
	databaseURL: "https://sentiment-pharma-default-rtdb.firebaseio.com",
	projectId: "sentiment-pharma",
	storageBucket: "sentiment-pharma.firebasestorage.app",
	messagingSenderId: "449924197230",
	appId: "1:449924197230:web:e38bfc75f5392472316f7f",
	measurementId: "G-N9HZMK61T3",
};

// Enabled by default. Set VITE_ENABLE_FIREBASE=false to disable initialization.
const FIREBASE_ENABLED = import.meta.env.VITE_ENABLE_FIREBASE !== "false";

let app = null;
let db = null;
let auth = null;
let database = null;

if (FIREBASE_ENABLED) {
	try {
		app = initializeApp(firebaseConfig);

		try {
			db = initializeFirestore(app, {
				localCache: persistentLocalCache({
					tabManager: persistentMultipleTabManager(),
				}),
			});
		} catch {
			db = getFirestore(app);
		}

		auth = getAuth(app);
		database = getDatabase(app);
		console.log("Firebase initialized successfully");
	} catch (error) {
		console.error("Firebase initialization error:", error);
	}
} else {
	console.warn("Firebase connection disabled (VITE_ENABLE_FIREBASE is not 'true').");
}

export { db, auth, database };
export default app;
