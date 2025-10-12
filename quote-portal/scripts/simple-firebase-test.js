import { db, isFirebaseAvailable } from '../src/firebase-config.js';
import { collection, getDocs } from 'firebase/firestore';

console.log('🔥 Firebase Bağlantı Testi...');

async function testFirebaseConnection() {
  try {
    console.log('Firebase Available:', isFirebaseAvailable());
    
    if (!isFirebaseAvailable()) {
      console.log('❌ Firebase bağlantısı kurulamadı');
      return;
    }

    console.log('✅ Firebase bağlantısı başarılı');
    
    // Kategorileri test et
    const categoriesRef = collection(db, 'categories');
    const categoriesSnapshot = await getDocs(categoriesRef);
    console.log(`📋 Categories koleksiyonu: ${categoriesSnapshot.size} dokuman`);
    
    categoriesSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${doc.id}: ${data.name || 'İsimsiz'}`);
    });

    // Malzemeleri test et
    const materialsRef = collection(db, 'materials');
    const materialsSnapshot = await getDocs(materialsRef);
    console.log(`📦 Materials koleksiyonu: ${materialsSnapshot.size} dokuman`);
    
    materialsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${doc.id}: ${data.name || 'İsimsiz'}`);
    });

  } catch (error) {
    console.error('❌ Firebase test hatası:', error);
  }
}

testFirebaseConnection();