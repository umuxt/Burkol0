const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

admin.initializeApp({ 
  credential: admin.credential.cert(serviceAccount) 
});

const db = admin.firestore();

async function debugSupplierMaterials() {
  try {
    console.log('🔍 Checking supplier materials...\n');
    
    const suppliersRef = db.collection('suppliers');
    const snapshot = await suppliersRef.get();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`📋 Supplier: ${data.code} - ${data.name || data.companyName}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Has suppliedMaterials: ${!!data.suppliedMaterials}`);
      
      if (data.suppliedMaterials && data.suppliedMaterials.length > 0) {
        console.log(`   Materials count: ${data.suppliedMaterials.length}`);
        data.suppliedMaterials.forEach((material, index) => {
          console.log(`     ${index+1}. ${material.materialCode} - ${material.materialName}`);
          console.log(`        ID: ${material.materialId}`);
          console.log(`        Price: ${material.price || 0}`);
          console.log(`        Added: ${material.addedAt}`);
        });
      } else {
        console.log(`   ❌ No materials found`);
      }
      console.log(''); // Empty line
    });
    
    console.log('\n🔍 Now checking materials collection...\n');
    
    const materialsRef = db.collection('materials');
    const materialsSnapshot = await materialsRef.get();
    
    console.log(`📦 Total materials in database: ${materialsSnapshot.docs.length}`);
    
    if (materialsSnapshot.docs.length > 0) {
      console.log('\nFirst 3 materials:');
      materialsSnapshot.docs.slice(0, 3).forEach(doc => {
        const material = doc.data();
        console.log(`- ${material.code}: ${material.name} (ID: ${doc.id})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

debugSupplierMaterials();