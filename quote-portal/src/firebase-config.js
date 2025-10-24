import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, initializeFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCjk0dG1CjZECHzwT9cr9S19XhnMnTYgmI",
  authDomain: "burkolmetal-726f3.firebaseapp.com",
  projectId: "burkolmetal-726f3",
  storageBucket: "burkolmetal-726f3.appspot.com",
  messagingSenderId: "271422310075",
  appId: "1:271422310075:web:0f466fc8deeed58f4d4b9e",
  measurementId: "G-25LT6XSH60"
};

// Environment Configuration
const isDevelopment = (typeof import.meta !== 'undefined' && import.meta.env) 
  ? import.meta.env.MODE === 'development' 
  : true;

const isProduction = (typeof import.meta !== 'undefined' && import.meta.env) 
  ? import.meta.env.MODE === 'production' 
  : false;

const useEmulator = false; // Disable emulator to avoid CORS issues

let app;
let db;
let auth;

// ================================
// FIREBASE INITIALIZATION
// ================================

console.log('🔥 Initializing Firebase...');
console.log(`Environment: ${(typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.MODE : 'development'}`);
console.log(`Emulator mode: ${useEmulator}`);

try {
  // Initialize Firebase App
  app = initializeApp(firebaseConfig);
  console.log('✅ Firebase App initialized');
  
  // Initialize Firestore with minimum cache size and CORS workarounds
  db = initializeFirestore(app, {
    cacheSizeBytes: 1048576, // Minimum 1MB cache size
    localCache: undefined, // Disable local cache
    experimentalForceLongPolling: true, // Force long polling instead of websockets
    ignoreUndefinedProperties: true
  });
  console.log('✅ Firestore initialized with minimal cache');
  
  // Initialize Auth
  auth = getAuth(app);
  console.log('✅ Firebase Auth initialized');
  
  console.log('✅ Firebase initialization completed successfully');
  
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  
  // Set to null for fallback handling
  app = null;
  db = null;
  auth = null;
}

// ================================
// HELPER FUNCTIONS
// ================================

export const isFirebaseAvailable = () => {
  return app !== null && db !== null;
};

export const getFirebaseStatus = () => {
  return {
    available: isFirebaseAvailable(),
    environment: (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.MODE : 'development',
    emulator: useEmulator,
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain
  };
};

// ================================
// EXPORTS
// ================================

// **Firestore Collection References**
export const COLLECTIONS = {
  MATERIALS: 'materials',
  CATEGORIES: 'categories', 
  USERS: 'users',
  SESSIONS: 'sessions',
  AUDIT_LOGS: 'auditLogs',
  SUPPLIERS: 'suppliers',
  ORDERS: 'orders'
  // ORDER_ITEMS: Removed - embedded in orders
  // STOCK_MOVEMENTS: Removed - handled by backend
};

export { app, db, auth };
export default { app, db, auth, isFirebaseAvailable, getFirebaseStatus };