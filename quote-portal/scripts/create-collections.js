// Firebase Koleksiyonları Test ve Oluşturma Script
// Bu script Firebase'e bağlanabildiğimizi kontrol eder ve koleksiyonları oluşturur

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc } from 'firebase/firestore';

// Firebase Configuration - firebase-config.js'den kopyalandı
const firebaseConfig = {
  apiKey: "AIzaSyCjk0dG1CjZECHzwT9cr9S19XhnMnTYgmI",
  authDomain: "burkolmetal-726f3.firebaseapp.com",
  projectId: "burkolmetal-726f3",
  storageBucket: "burkolmetal-726f3.appspot.com",
  messagingSenderId: "271422310075",
  appId: "1:271422310075:web:0f466fc8deeed58f4d4b9e",
  measurementId: "G-25LT6XSH60"
};

// Firebase'i başlat
let app, db;

try {
  console.log('🔥 Firebase bağlantısı test ediliyor...');
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log('✅ Firebase başarıyla bağlandı');
} catch (error) {
  console.error('❌ Firebase bağlantı hatası:', error);
  process.exit(1);
}

// Test verileri
const testCategory = {
  id: 'test-category-001',
  name: 'Test Kategorisi',
  code: 'TEST',
  description: 'Test için oluşturulan kategori',
  color: '#FF6B6B',
  icon: 'test',
  sortOrder: 1,
  materialCount: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

const testMaterial = {
  id: 'test-material-001',
  code: 'TEST-001',
  name: 'Test Malzemesi',
  type: 'Test',
  category: 'test-category-001',
  unit: 'Adet',
  stock: 100,
  reorderPoint: 10,
  reserved: 0,
  available: 100,
  costPrice: 10.00,
  sellPrice: 15.00,
  supplier: 'Test Tedarikçi',
  status: 'Aktif',
  description: 'Test için oluşturulan malzeme',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'test-user',
  updatedBy: 'test-user'
};

const testStockMovement = {
  materialId: 'test-material-001',
  materialCode: 'TEST-001',
  type: 'in',
  subType: 'initial',
  quantity: 100,
  unit: 'Adet',
  stockBefore: 0,
  stockAfter: 100,
  reference: 'INITIAL-TEST',
  referenceType: 'manual',
  notes: 'Test için ilk stok girişi',
  movementDate: new Date(),
  createdAt: new Date(),
  userId: 'test-user',
  userName: 'Test User',
  approved: true,
  approvedBy: 'test-user',
  approvedAt: new Date()
};

const testStockAlert = {
  materialId: 'test-material-001',
  materialCode: 'TEST-001',
  materialName: 'Test Malzemesi',
  alertType: 'low_stock',
  severity: 'warning',
  currentStock: 5,
  threshold: 10,
  message: 'Test malzemesi minimum stok seviyesinde',
  isActive: true,
  isRead: false,
  readBy: [],
  createdAt: new Date()
};

// Koleksiyonları oluştur
async function createCollections() {
  try {
    console.log('\n📋 Firebase koleksiyonları oluşturuluyor...');
    
    // 1. Categories koleksiyonu
    console.log('1️⃣ Categories koleksiyonu oluşturuluyor...');
    const categoryRef = doc(db, 'categories', testCategory.id);
    await setDoc(categoryRef, testCategory);
    console.log('✅ Categories koleksiyonu oluşturuldu');
    
    // 2. Materials koleksiyonu
    console.log('2️⃣ Materials koleksiyonu oluşturuluyor...');
    const materialRef = doc(db, 'materials', testMaterial.id);
    await setDoc(materialRef, testMaterial);
    console.log('✅ Materials koleksiyonu oluşturuldu');
    
    // 3. Stock Movements koleksiyonu
    console.log('3️⃣ Stock Movements koleksiyonu oluşturuluyor...');
    const movementRef = await addDoc(collection(db, 'stockMovements'), testStockMovement);
    console.log('✅ Stock Movements koleksiyonu oluşturuldu, ID:', movementRef.id);
    
    // 4. Stock Alerts koleksiyonu
    console.log('4️⃣ Stock Alerts koleksiyonu oluşturuluyor...');
    const alertRef = await addDoc(collection(db, 'stockAlerts'), testStockAlert);
    console.log('✅ Stock Alerts koleksiyonu oluşturuldu, ID:', alertRef.id);
    
    console.log('\n🎉 Tüm koleksiyonlar başarıyla oluşturuldu!');
    console.log('\nFirebase Console\'da şu koleksiyonları görebilmelisiniz:');
    console.log('- categories');
    console.log('- materials');
    console.log('- stockMovements');
    console.log('- stockAlerts');
    
  } catch (error) {
    console.error('❌ Koleksiyon oluşturma hatası:', error);
    if (error.code === 'permission-denied') {
      console.log('\n⚠️  İzin hatası! Firebase Security Rules kontrol edin:');
      console.log('Firebase Console > Firestore Database > Rules');
      console.log('Geçici olarak şu rule\'ı kullanabilirsiniz:');
      console.log(`
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // TEMPORARİ - PRODUCTION İÇİN GÜVENLİ DEĞİL
    }
  }
}`);
    }
  }
}

// Mevcut koleksiyonları listele
async function listCollections() {
  try {
    console.log('\n📊 Mevcut koleksiyonlar kontrol ediliyor...');
    
    const collections = ['categories', 'materials', 'stockMovements', 'stockAlerts'];
    
    for (const collectionName of collections) {
      try {
        const querySnapshot = await getDocs(collection(db, collectionName));
        console.log(`${collectionName}: ${querySnapshot.size} dokuman`);
        
        if (querySnapshot.size > 0) {
          querySnapshot.forEach((doc) => {
            console.log(`  - ${doc.id}: ${doc.data().name || doc.data().materialName || 'No name'}`);
          });
        }
      } catch (error) {
        console.log(`${collectionName}: Koleksiyon bulunamadı veya hata`);
      }
    }
  } catch (error) {
    console.error('❌ Koleksiyon listeleme hatası:', error);
  }
}

// Test fonksiyonu
async function testFirebaseConnection() {
  try {
    console.log('\n🔍 Firebase bağlantısı test ediliyor...');
    
    // Basit bir test dokuman oluştur
    const testRef = await addDoc(collection(db, 'test'), {
      message: 'Firebase bağlantı testi',
      timestamp: new Date()
    });
    
    console.log('✅ Test dokuman oluşturuldu, ID:', testRef.id);
    
    // Test dokuman oku
    const testSnapshot = await getDocs(collection(db, 'test'));
    console.log(`✅ Test koleksiyonunda ${testSnapshot.size} dokuman bulundu`);
    
    return true;
  } catch (error) {
    console.error('❌ Firebase bağlantı testi başarısız:', error);
    return false;
  }
}

// Ana fonksiyon
async function main() {
  console.log('🚀 Firebase Koleksiyon Oluşturucu Başlatılıyor...\n');
  
  // Komut satırı argümanları
  const command = process.argv[2] || 'create';
  
  switch (command) {
    case 'test':
      const connectionOk = await testFirebaseConnection();
      if (!connectionOk) {
        console.log('\n❌ Firebase bağlantısında sorun var. Lütfen:');
        console.log('1. Firebase Console\'da proje aktif mi kontrol edin');
        console.log('2. Firestore Database oluşturulmuş mu kontrol edin');
        console.log('3. Security Rules uygun mu kontrol edin');
        process.exit(1);
      }
      break;
      
    case 'list':
      await listCollections();
      break;
      
    case 'create':
    default:
      await createCollections();
      await listCollections();
      break;
  }
  
  console.log('\n✨ İşlem tamamlandı!');
}

// Script çalıştır
main().catch(console.error);

export { createCollections, listCollections, testFirebaseConnection };