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

// Development mode: Skip Firebase client initialization to avoid CORS errors
// Backend handles all Firebase operations via Admin SDK
if (process.env.NODE_ENV === 'production') {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log('🔥 Firebase initialized successfully');
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error);
  }
} else {
  console.log('🔥 Firebase client skipped in development (using backend API)');
  db = null; // Use API instead of direct Firebase
}

export { db };
