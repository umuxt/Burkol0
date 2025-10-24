// Firebase Deprecated Collections Cleanup Script
// Bu script artık kullanılmayan koleksiyonları Firebase'den temizler

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, deleteDoc, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCjk0dG1CjZECHzwT9cr9S19XhnMnTYgmI',
  authDomain: 'burkolmetal-726f3.firebaseapp.com',
  projectId: 'burkolmetal-726f3',
  storageBucket: 'burkolmetal-726f3.appspot.com',
  messagingSenderId: '271422310075',
  appId: '1:271422310075:web:0f466fc8deeed58f4d4b9e'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Artık kullanılmayan koleksiyonlar
const DEPRECATED_COLLECTIONS = [
  'orderItems',
  'orderItemCounters', 
  'stockMovements',
  'systemCounters' // Eğer varsa bu da
];

async function deleteCollection(collectionName) {
  try {
    console.log(`🗑️  ${collectionName} koleksiyonu temizleniyor...`);
    
    const collectionRef = collection(db, collectionName);
    const snapshot = await getDocs(collectionRef);
    
    if (snapshot.empty) {
      console.log(`📋 ${collectionName} koleksiyonu zaten boş`);
      return;
    }
    
    console.log(`📦 ${collectionName} koleksiyonunda ${snapshot.size} dokuman bulundu`);
    
    // Batch operations for better performance
    const batchSize = 500; // Firestore batch limit
    const docs = snapshot.docs;
    
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchDocs = docs.slice(i, i + batchSize);
      
      batchDocs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      console.log(`✅ ${Math.min(i + batchSize, docs.length)}/${docs.length} dokuman silindi`);
    }
    
    console.log(`🎉 ${collectionName} koleksiyonu başarıyla temizlendi`);
    
  } catch (error) {
    console.error(`❌ ${collectionName} koleksiyonu silinirken hata:`, error);
  }
}

async function cleanupDeprecatedCollections() {
  console.log('🚀 Deprecated koleksiyonları temizleme başlatılıyor...');
  console.log('📋 Silinecek koleksiyonlar:', DEPRECATED_COLLECTIONS);
  
  for (const collectionName of DEPRECATED_COLLECTIONS) {
    await deleteCollection(collectionName);
    console.log(''); // Boş satır
  }
  
  console.log('✨ Tüm deprecated koleksiyonlar temizlendi!');
  console.log('');
  console.log('📝 Özet:');
  console.log('  ✅ orderItems - Artık orders içinde embedded');
  console.log('  ✅ orderItemCounters - Backend tarafından yönetiliyor');
  console.log('  ✅ stockMovements - Backend API ile yönetiliyor');
  console.log('  ✅ systemCounters - Backend tarafından yönetiliyor');
}

// Script'i çalıştır
cleanupDeprecatedCollections().catch(console.error);