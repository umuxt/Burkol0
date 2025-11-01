#!/usr/bin/env node

/**
 * Firebase Sessions Koleksiyonu Geri Yükleme Script'i
 * 
 * Bu script silinen sessions koleksiyonunu geri oluşturur.
 * Boş bir placeholder döküman ekleyerek koleksiyonu başlatır.
 */

import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Firebase Admin SDK'yı başlat
try {
  const serviceAccount = JSON.parse(
    readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf8')
  )
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  })
  
  console.log('✅ Firebase Admin SDK başlatıldı')
} catch (error) {
  console.error('❌ Firebase Admin SDK başlatılamadı:', error.message)
  process.exit(1)
}

const db = admin.firestore()

async function restoreSessionsCollection() {
  try {
    console.log('🔄 Sessions koleksiyonu geri yükleniyor...')
    
    // Koleksiyonun mevcut olup olmadığını kontrol et
    const sessionsRef = db.collection('sessions')
    const snapshot = await sessionsRef.limit(1).get()
    
    if (!snapshot.empty) {
      console.log('ℹ️  Sessions koleksiyonu zaten mevcut. Toplam döküman sayısı:', snapshot.size)
      
      // Mevcut dökümanları listele
      const allSessions = await sessionsRef.get()
      console.log('📊 Mevcut sessions dökümanları:')
      allSessions.docs.forEach(doc => {
        const data = doc.data()
        console.log(`  - ${doc.id}: ${data.email || 'No email'} (${data.createdAt ? new Date(data.createdAt._seconds * 1000).toISOString() : 'No date'})`)
      })
      return
    }
    
    // Boş koleksiyon ise, placeholder döküman ekle
    console.log('📝 Placeholder session dökümanı ekleniyor...')
    
    const placeholderSession = {
      sessionId: 'placeholder-session',
      userId: 'placeholder-user',
      email: 'placeholder@example.com',
      role: 'user',
      token: 'placeholder-token',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActivity: admin.firestore.FieldValue.serverTimestamp(),
      isActive: false,
      isPlaceholder: true // Bu dökümanın placeholder olduğunu belirt
    }
    
    await sessionsRef.doc('placeholder-session').set(placeholderSession)
    
    console.log('✅ Sessions koleksiyonu başarıyla geri yüklendi!')
    console.log('ℹ️  Placeholder döküman eklendi. İsterseniz daha sonra silebilirsiniz.')
    
    // Koleksiyon oluşturulduktan sonra placeholder'ı sil (isteğe bağlı)
    const shouldDeletePlaceholder = process.argv.includes('--delete-placeholder')
    if (shouldDeletePlaceholder) {
      console.log('🗑️  Placeholder döküman siliniyor...')
      await sessionsRef.doc('placeholder-session').delete()
      console.log('✅ Placeholder döküman silindi')
    } else {
      console.log('💡 Placeholder dökümanı silmek için: node restore-sessions-collection.js --delete-placeholder')
    }
    
  } catch (error) {
    console.error('❌ Sessions koleksiyonu geri yüklenirken hata:', error.message)
    console.error(error)
  }
}

// Script'i çalıştır
restoreSessionsCollection()
  .then(() => {
    console.log('🎉 İşlem tamamlandı')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Beklenmeyen hata:', error)
    process.exit(1)
  })