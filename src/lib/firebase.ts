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
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
	measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
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
