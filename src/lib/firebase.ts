import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const functions = (() => {
  try {
    return getFunctions(app, 'us-central1');
  } catch (error) {
    console.warn('Firebase Functions is unavailable in this environment.', error);
    return null;
  }
})();
export const storage = getStorage(app);

// Fail fast in local/dev when Storage networking or CORS is misconfigured.
(storage as any).maxUploadRetryTime = 4000;
(storage as any).maxOperationRetryTime = 4000;

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
