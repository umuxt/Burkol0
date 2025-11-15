import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serviceAccount = JSON.parse(readFileSync(join(__dirname, '../config/serviceAccountKey.json'), 'utf-8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function cleanupWipMovements() {
  try {
    console.log('🔍 WIP ile ilgili tüm stock movements sorgulanıyor...');
    
    // Query 1: status='wip' olanlar
    const statusSnapshot = await db.collection('stockMovements')
      .where('status', '==', 'wip')
      .get();
    
    console.log(`📊 status='wip' olan ${statusSnapshot.size} kayıt bulundu`);
    
    // Query 2: subType='wip_reservation' olanlar
    const subTypeSnapshot = await db.collection('stockMovements')
      .where('subType', '==', 'wip_reservation')
      .get();
    
    console.log(`📊 subType='wip_reservation' olan ${subTypeSnapshot.size} kayıt bulundu`);
    
    // Query 3: subType='wip_release' olanlar (eski sistem)
    const releaseSnapshot = await db.collection('stockMovements')
      .where('subType', '==', 'wip_release')
      .get();
    
    console.log(`📊 subType='wip_release' olan ${releaseSnapshot.size} kayıt bulundu`);
    
    // Tüm dokümanları birleştir (중복 kaldır)
    const allDocs = new Map();
    statusSnapshot.docs.forEach(doc => allDocs.set(doc.id, doc));
    subTypeSnapshot.docs.forEach(doc => allDocs.set(doc.id, doc));
    releaseSnapshot.docs.forEach(doc => allDocs.set(doc.id, doc));
    
    const totalCount = allDocs.size;
    console.log(`\n📊 Toplam ${totalCount} benzersiz WIP kaydı bulundu`);
    
    if (totalCount === 0) {
      console.log('✅ Silinecek WIP kaydı yok');
      return;
    }
    
    // İlk 10 kaydı göster
    console.log('\n📋 İlk 10 WIP kaydı:');
    Array.from(allDocs.values()).slice(0, 10).forEach((doc, i) => {
      const data = doc.data();
      const date = data.movementDate?.toDate?.() || data.createdAt?.toDate?.() || 'Tarih yok';
      console.log(`  ${i+1}. ${doc.id}`);
      console.log(`     Material: ${data.materialCode} - ${data.materialName || 'İsimsiz'}`);
      console.log(`     Status: ${data.status || 'yok'} | SubType: ${data.subType || 'yok'}`);
      console.log(`     Quantity: ${data.quantity} ${data.unit || ''}`);
      console.log(`     Reference: ${data.reference || 'Yok'}`);
      console.log(`     Date: ${date}`);
      console.log('');
    });
    
    console.log('\n🗑️  Tüm WIP kayıtları siliniyor...');
    
    // Batch deletion (max 500 per batch)
    const docs = Array.from(allDocs.values());
    for (let i = 0; i < docs.length; i += 500) {
      const batch = db.batch();
      const batchDocs = docs.slice(i, i + 500);
      batchDocs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      console.log(`   ✅ ${Math.min(i + 500, docs.length)}/${docs.length} kayıt silindi`);
    }
    
    console.log(`✅ ${totalCount} WIP kaydı başarıyla silindi!`);
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
    console.error(error);
    process.exit(1);
  }
}

cleanupWipMovements().then(() => {
  console.log('\n✅ İşlem tamamlandı');
  process.exit(0);
}).catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
