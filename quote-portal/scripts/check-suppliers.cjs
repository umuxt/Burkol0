const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ 
  credential: admin.credential.cert(serviceAccount) 
});

const db = admin.firestore();

async function checkSuppliers() {
  try {
    const suppliersRef = db.collection('suppliers');
    const snapshot = await suppliersRef.get();
    
    console.log('Current suppliers:');
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`- ${data.code}: ${data.name}`);
      console.log(`  Has suppliedMaterials: ${!!data.suppliedMaterials}`);
      if (data.suppliedMaterials) {
        console.log(`  Materials count: ${data.suppliedMaterials.length}`);
      }
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

checkSuppliers();