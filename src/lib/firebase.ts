import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  enableNetwork, 
  disableNetwork, 
  getDocFromServer, 
  getDoc, 
  doc, 
  DocumentReference, 
  DocumentSnapshot, 
  getDocFromCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache
} from 'firebase/firestore';
import { getFriendlyErrorMessage } from './errorMapping';
import firebaseConfig from '../../firebase-applet-config.json';

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
};

// Use environment variables if at least the API Key is present, otherwise fallback to local config
const finalConfig = envConfig.apiKey ? envConfig : firebaseConfig;

if (typeof window !== 'undefined') {
  console.log('Firebase Init: Using ' + (envConfig.apiKey ? 'Environment Variables' : 'Local Config File'));
  if (!finalConfig.apiKey) {
    console.error('Firebase Error: API Key missing in configuration!');
  }
}

const app = initializeApp(finalConfig);

// Use long polling to avoid gRPC issues in some environments. 
const rawDatabaseId = 
  import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 
  (firebaseConfig as any).firestoreDatabaseId || 
  '(default)';

// Clean database ID if it matches common placeholders
const databaseId = (rawDatabaseId === '(default)' || !rawDatabaseId) ? undefined : rawDatabaseId;

if (typeof window !== 'undefined') {
  console.log('Firestore Initialization Context:', { 
    requestedDb: databaseId || '(default)',
    envDb: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
    configDb: (firebaseConfig as any).firestoreDatabaseId
  });
}

// Initialize Firestore with settings optimized for restricted environments (iframes/dashboards)
let localCacheSetting: any;
if (typeof window !== 'undefined') {
  try {
    localCacheSetting = persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    });
  } catch (e) {
    console.warn('Firestore: IndexedDB persistent local cache is not supported/allowed in this context. Falling back to memory cache.');
    localCacheSetting = memoryLocalCache();
  }
} else {
  localCacheSetting = memoryLocalCache();
}

const firestoreSettings: any = {
  localCache: localCacheSetting,
  ignoreUndefinedProperties: true
};

// We export a function that tries to find a working DB instance
let db: any;
try {
  db = databaseId 
    ? initializeFirestore(app, firestoreSettings, databaseId)
    : initializeFirestore(app, firestoreSettings);
} catch (e) {
  console.warn('Firestore primary initialization failed with custom settings. Falling back to default initialization.', e);
  try {
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch (fallbackErr) {
    console.error('Firestore fallback failed:', fallbackErr);
  }
}

export { db };

/**
 * Resilient document fetcher that tries local cache first, then server
 */
export async function getDocResilient(ref: DocumentReference): Promise<DocumentSnapshot> {
  // 1. Try standard getDoc (respects cache + network)
  try {
    return await getDoc(ref);
  } catch (e: any) {
    if (!isOfflineError(e)) throw e;
  }

  // 2. Retry loop for network issues
  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.warn(`Firestore: Retry ${attempt + 1} for ${ref.path}`);
      await enableNetwork(db).catch(() => {});
      await new Promise(r => setTimeout(r, 1000 + attempt * 1000));
      
      if (attempt === 1) await forceReconnect();
      
      return await getDocFromServer(ref);
    } catch (e: any) {
      lastError = e;
      if (!isOfflineError(e)) throw e;
    }
  }

  // 3. Final Fallback: Try Cache strictly
  try {
    console.warn("Firestore: Final attempt from local cache for", ref.path);
    return await getDocFromCache(ref);
  } catch (cacheErr) {
    const errorToCheck = lastError || cacheErr;
    if (isOfflineError(errorToCheck)) {
      console.warn("Firestore: Client is currently offline and document is not cached. Returning a safe dummy non-existent snapshot to prevent blocking UI.", ref.path);
      // Return a pseudo-snapshot to avoid throwing hard offline crashes to callers
      return {
        exists: () => false,
        data: () => undefined,
        id: ref.id,
        ref: ref,
        metadata: { fromCache: true, hasPendingWrites: false }
      } as any;
    }
    console.error("Firestore: Total failure (Server & Cache) for", ref.path, lastError || cacheErr);
    throw lastError || cacheErr;
  }
}

// Persistence is handled by localCache in modern SDKs (v10.3+), 
// but we keep a fallback for compatibility if needed.
if (typeof window !== 'undefined' && !db.type) {
  // enableIndexedDbPersistence is legacy but some older v9/v10 versions might need it
  // if initializeFirestore above doesn't support localCache format yet.
}

export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = (error as any)?.code;

  // Proactive reconnection attempt if we hit an offline error
  if (errorMessage.toLowerCase().includes('offline') || errorCode === 'unavailable') {
    enableNetwork(db).catch(e => console.warn('Retrying enableNetwork failed:', e));
  }
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  console.error('Firestore Error: ', errInfo);
  
  // We remove the alert() here because it can be intrusive and blocked in iframes.
  // The components should handle displaying the error via setErrorDetails.
  
  throw error;
}

export function isOfflineError(e: any): boolean {
  if (!e) return false;
  const message = (e.message || String(e)).toLowerCase();
  const code = e.code;
  return message.includes('offline') || code === 'unavailable' || message.includes('network') || message.includes('failed to get document');
}

export async function forceReconnect() {
  if (typeof window === 'undefined') return false;
  
  try {
    // Attempt to hard reset the network state by disabling then enabling
    console.log('🔄 Firestore: Kicking network connection...');
    await disableNetwork(db).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
    await enableNetwork(db);
    console.log('🚀 Firestore Network Handshake: Success');
    
    // Test a ping
    const testRef = doc(db, '_health', 'ping');
    await getDocFromServer(testRef).catch(() => {});
    
    return true;
  } catch (e: any) {
    if (e.code === 'failed-precondition') {
      return true;
    }
    console.error('❌ Force reconnect failed:', e);
    return false;
  }
}
