import admin from 'firebase-admin'
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..')
const serviceAccountPath = path.join(projectRoot, 'serviceAccountKey.json')

async function bootstrapAdmin() {
  if (admin.apps.length) return admin.app()
  const raw = await readFile(serviceAccountPath, 'utf8')
  const serviceAccount = JSON.parse(raw)
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })
}

async function deleteDocs(ref, filterFn = () => true) {
  const snapshot = await ref.get()
  if (snapshot.empty) return 0
  const batch = ref.firestore.batch()
  let count = 0
  snapshot.docs.forEach(doc => {
    if (filterFn(doc)) {
      batch.delete(doc.ref)
      count += 1
    }
  })
  if (count === 0) return 0
  await batch.commit()
  return count
}

async function deleteCollection(collectionRef, batchSize = 100) {
  let totalDeleted = 0
  let run = true
  while (run) {
    const snapshot = await collectionRef.limit(batchSize).get()
    if (snapshot.empty) {
      run = false
      continue
    }
    const batch = collectionRef.firestore.batch()
    snapshot.docs.forEach(doc => batch.delete(doc.ref))
    await batch.commit()
    totalDeleted += snapshot.size
  }
  return totalDeleted
}

async function cleanup() {
  await bootstrapAdmin()
  const db = admin.firestore()
  const summary = {
    priceSettingsCollectionRemoved: 0,
    quoteVersionsRemoved: 0,
    settingsFieldsRemoved: [],
    notes: []
  }

  // Remove deprecated priceSettings collection (replaced by new architecture)
  try {
    const priceSettingsRef = db.collection('priceSettings')
    const removed = await deleteCollection(priceSettingsRef)
    summary.priceSettingsCollectionRemoved = removed
  } catch (err) {
    summary.notes.push(`priceSettings cleanup skipped: ${err.message}`)
  }

  // Remove deprecated quoteVersions collection if it exists
  try {
    const quoteVersionsRef = db.collection('quoteVersions')
    const deleted = await deleteCollection(quoteVersionsRef)
    summary.quoteVersionsRemoved = deleted
  } catch (err) {
    summary.notes.push(`quoteVersions cleanup skipped: ${err.message}`)
  }

  // Remove embedded price/form configs from settings/main
  const settingsDoc = db.collection('settings').doc('main')
  try {
    await settingsDoc.update({
      priceSettings: admin.firestore.FieldValue.delete(),
      formConfig: admin.firestore.FieldValue.delete()
    })
    summary.settingsFieldsRemoved.push('priceSettings', 'formConfig')
  } catch (err) {
    summary.notes.push(`settings/main update skipped: ${err.message}`)
  }

  // Remove historic priceSettings documents using migration flags
  const priceSettingsVersionsRef = db.collection('priceSettingsVersions')
  await deleteDocs(priceSettingsVersionsRef, doc => doc.data()?.isHistorical === true)

  console.log('✅ Firestore cleanup completed')
  console.table(summary)
  process.exit(0)
}

cleanup().catch(err => {
  console.error('❌ Firestore cleanup failed:', err)
  process.exit(1)
})
