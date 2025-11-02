const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

admin.initializeApp({ 
  credential: admin.credential.cert(serviceAccount) 
});

const db = admin.firestore();

async function updateSuppliers() {
  try {
    const suppliersRef = db.collection('suppliers');
    const snapshot = await suppliersRef.get();
    
    console.log('Updating suppliers with suppliedMaterials array...');
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!data.suppliedMaterials) {
        batch.update(doc.ref, {
          suppliedMaterials: []
        });
        console.log(`Updated ${data.code}: ${data.name}`);
      }
    });
    
    await batch.commit();
    console.log('All suppliers updated successfully!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

updateSuppliers();