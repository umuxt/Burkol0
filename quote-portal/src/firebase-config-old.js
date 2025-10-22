import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
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
  : true; // Default to development in Node.js

const isProduction = (typeof import.meta !== 'undefined' && import.meta.env) 
  ? import.meta.env.MODE === 'production' 
  : false;

const useEmulator = isDevelopment && (
  (typeof import.meta !== 'undefined' && import.meta.env) 
    ? import.meta.env.VITE_FIREBASE_EMULATOR === 'true'
    : false
);

let app;
let db;
let auth;

// ================================
// FIREBASE INITIALIZATION
// ================================

console.log('🔥 Initializing Firebase...');
console.log(`Environment: ${(typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.MODE : 'node'} || 'development'`);
console.log(`Emulator mode: ${useEmulator}`);

try {
  // Initialize Firebase App
  app = initializeApp(firebaseConfig);
  
  // Initialize Firestore
  db = getFirestore(app);
  
  // Initialize Auth
  auth = getAuth(app);
  
  // Connect to emulators in development
  if (useEmulator) {
    console.log('� Connecting to Firebase emulators...');
    
    // Firestore emulator
    if (!db._delegate._databaseId.projectId.includes('demo-')) {
      connectFirestoreEmulator(db, 'localhost', 8080);
    }
    
    // Auth emulator
    if (!auth.config.apiKey.includes('demo-')) {
      connectAuthEmulator(auth, 'http://localhost:9099');
    }
    
    console.log('✅ Connected to Firebase emulators');
  }
  
  console.log('✅ Firebase initialized successfully');
  
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  
  // Fallback for development
  if (isDevelopment) {
    console.log('🔄 Falling back to mock Firebase for development');
    db = null;
    auth = null;
  } else {
    throw error; // Re-throw in production
  }
}

// ================================
// FIREBASE UTILITIES
// ================================

// **Environment Check**
export const isFirebaseAvailable = () => {
  return db !== null && auth !== null;
};

// **Connection Status**
export const getFirebaseStatus = () => {
  return {
    available: isFirebaseAvailable(),
    environment: (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.MODE : 'node',
    emulator: useEmulator,
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain
  };
};

// **Firestore Collection References**
export const COLLECTIONS = {
  MATERIALS: 'materials',
  CATEGORIES: 'categories', 
  USERS: 'users',
  SESSIONS: 'sessions',
  AUDIT_LOGS: 'auditLogs',
  SUPPLIERS: 'suppliers',
  ORDERS: 'orders',
  ORDER_ITEMS: 'orderItems'
};

// **Error Handler**
export const handleFirebaseError = (error, context = 'Firebase operation') => {
  console.error(`${context} failed:`, error);
  
  // Common Firebase error codes
  const errorMap = {
    'permission-denied': 'Yetki hatası: Bu işlem için yetkiniz yok',
    'not-found': 'Veri bulunamadı',
    'already-exists': 'Bu veri zaten mevcut',
    'invalid-argument': 'Geçersiz parametre',
    'deadline-exceeded': 'İşlem zaman aşımına uğradı',
    'unavailable': 'Firebase servisi şu anda kullanılamıyor'
  };
  
  const userMessage = errorMap[error.code] || 'Bilinmeyen hata oluştu';
  
  return {
    code: error.code,
    message: userMessage,
    technical: error.message,
    context
  };
};

// **Health Check**
export const checkFirebaseHealth = async () => {
  try {
    if (!isFirebaseAvailable()) {
      return {
        status: 'disconnected',
        message: 'Firebase not available',
        timestamp: new Date().toISOString()
      };
    }
    
    // Try a simple read operation to test connection
    const testDoc = doc(db, 'health', 'check');
    await getDoc(testDoc); // This will fail if no connection
    
    return {
      status: 'connected',
      message: 'Firebase connection healthy',
      timestamp: new Date().toISOString(),
      config: getFirebaseStatus()
    };
    
  } catch (error) {
    return {
      status: 'error',
      message: 'Firebase connection failed',
      error: handleFirebaseError(error, 'Health check'),
      timestamp: new Date().toISOString()
    };
  }
};

// ================================
// EXPORTS
// ================================

export { 
  app, 
  db, 
  auth,
  firebaseConfig
};

export default {
  app,
  db,
  auth,
  isAvailable: isFirebaseAvailable,
  status: getFirebaseStatus,
  healthCheck: checkFirebaseHealth,
  handleError: handleFirebaseError,
  collections: COLLECTIONS
};