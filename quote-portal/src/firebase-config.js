import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCjk0dG1CjZECHzwT9cr9S19XhnMnTYgmI",
  authDomain: "burkolmetal-726f3.firebaseapp.com",
  projectId: "burkolmetal-726f3",
  storageBucket: "burkolmetal-726f3.appspot.com",
  messagingSenderId: "271422310075",
  appId: "1:271422310075:web:0f466fc8deeed58f4d4b9e",
  measurementId: "G-25LT6XSH60"
};

let app;
let db;

// IMPORTANT: Firebase Client Pattern
// - Development: Use API-only pattern (no direct Firebase client)
// - Production: Firebase client available but prefer API pattern for consistency
// - Backend: Always uses Firebase Admin SDK (server.js, jsondb.js)

if (process.env.NODE_ENV === 'production') {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log('🔥 Firebase client initialized (production mode)');
    console.log('💡 Recommendation: Use API endpoints instead of direct client calls');
  } catch (error) {
    console.error('❌ Firebase client initialization failed:', error);
    db = null; // Fallback to API-only
  }
} else {
  console.log('🔥 Firebase client disabled in development');
  console.log('💡 Using API-only pattern for consistent dev/prod behavior');
  db = null; // Always use API in development
}

export { db };