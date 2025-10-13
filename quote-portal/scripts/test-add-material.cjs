const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ 
  credential: admin.credential.cert(serviceAccount) 
});

const db = admin.firestore();

async function testAddMaterialToSupplier() {
  try {
    console.log('🧪 Testing manual material addition to supplier...\n');
    
    // İlk supplier'ı al
    const suppliersRef = db.collection('suppliers');
    const suppliersSnapshot = await suppliersRef.limit(1).get();
    
    if (suppliersSnapshot.empty) {
      console.log('❌ No suppliers found');
      return;
    }
    
    const supplierDoc = suppliersSnapshot.docs[0];
    const supplierId = supplierDoc.id;
    const supplierData = supplierDoc.data();
    
    console.log(`📋 Using supplier: ${supplierData.code} - ${supplierData.name || supplierData.companyName}`);
    
    // İlk material'ı al
    const materialsRef = db.collection('materials');
    const materialsSnapshot = await materialsRef.limit(1).get();
    
    if (materialsSnapshot.empty) {
      console.log('❌ No materials found');
      return;
    }
    
    const materialDoc = materialsSnapshot.docs[0];
    const materialData = materialDoc.data();
    
    console.log(`📦 Using material: ${materialData.code} - ${materialData.name}`);
    
    // Manual olarak malzemeyi supplier'a ekle
    const newMaterial = {
      materialId: materialDoc.id,
      materialCode: materialData.code,
      materialName: materialData.name,
      price: 100,
      deliveryTime: '5-7 gün',
      minQuantity: 1,
      addedAt: new Date().toISOString()
    };
    
    const currentMaterials = supplierData.suppliedMaterials || [];
    const updatedMaterials = [...currentMaterials, newMaterial];
    
    await supplierDoc.ref.update({
      suppliedMaterials: updatedMaterials,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Material successfully added to supplier!');
    
    // Kontrol et
    const updatedSupplierDoc = await supplierDoc.ref.get();
    const updatedSupplierData = updatedSupplierDoc.data();
    
    console.log(`🔍 Verification - Materials count: ${updatedSupplierData.suppliedMaterials?.length || 0}`);
    
    if (updatedSupplierData.suppliedMaterials && updatedSupplierData.suppliedMaterials.length > 0) {
      console.log('✅ Success! Material is now linked to supplier.');
      updatedSupplierData.suppliedMaterials.forEach((mat, idx) => {
        console.log(`  ${idx+1}. ${mat.materialCode} - ${mat.materialName}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit();
  }
}

testAddMaterialToSupplier();