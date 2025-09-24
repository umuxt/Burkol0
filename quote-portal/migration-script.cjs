const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK
// This automatically finds and uses 'serviceAccountKey.json'
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const dbPath = path.join(__dirname, 'db.json');
const localDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

async function migrate() {
  console.log('Starting migration...');

  // Migrate Quotes
  if (localDb.quotes && localDb.quotes.length > 0) {
    console.log(`Migrating ${localDb.quotes.length} quotes...`);
    const batch = db.batch();
    localDb.quotes.forEach(quote => {
      const docRef = db.collection('quotes').doc(quote.id);
      batch.set(docRef, quote);
    });
    await batch.commit();
    console.log('Quotes migration complete.');
  }

  // Migrate Users
  if (localDb.users && localDb.users.length > 0) {
    console.log(`Migrating ${localDb.users.length} users...`);
    const batch = db.batch();
    localDb.users.forEach(user => {
      const docRef = db.collection('users').doc(user.id);
      batch.set(docRef, user);
    });
    await batch.commit();
    console.log('Users migration complete.');
  }
  
  // Migrate Settings
  if (localDb.settings) {
    console.log('Migrating settings...');
    await db.collection('settings').doc('main').set(localDb.settings);
    console.log('Settings migration complete.');
  }

  console.log('Migration finished successfully!');
}

migrate().catch(console.error);
