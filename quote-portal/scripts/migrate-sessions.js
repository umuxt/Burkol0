#!/usr/bin/env node

// Migration script to convert existing sessions to new format
// New format: ss-yyyymmdd-000x with userName, loginTime, loginDate

import jsondb from '../src/lib/jsondb.js'
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json')
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })
}

const db = admin.firestore()

async function migrateSessions() {
  console.log('🔄 Starting session migration...')
  
  try {
    // Get all existing sessions from Firestore
    const sessionsSnapshot = await db.collection('sessions').get()
    
    if (sessionsSnapshot.empty) {
      console.log('ℹ️  No existing sessions found to migrate')
      return
    }
    
    const migratedSessions = []
    let counter = 1
    const today = new Date()
    const dateKey = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    
    console.log(`📅 Using date key: ${dateKey}`)
    
    for (const doc of sessionsSnapshot.docs) {
      const oldSession = doc.data()
      const docId = doc.id
      
      console.log(`🔄 Migrating session: ${docId}`)
      
      // Check if this is already a new format session
      if (oldSession.sessionId && oldSession.sessionId.startsWith('ss-')) {
        console.log(`✅ Session ${docId} already in new format, skipping`)
        continue
      }
      
      // Generate new session ID
      const sessionId = `ss-${dateKey}-${String(counter).padStart(4, '0')}`
      counter++
      
      // Get user info for userName
      let userName = 'Unknown User'
      if (oldSession.email) {
        const user = jsondb.getUser(oldSession.email)
        userName = user?.name || user?.email?.split('@')[0] || oldSession.email.split('@')[0]
      }
      
      // Create new session format
      const newSession = {
        sessionId,
        token: oldSession.token || docId, // Use docId as token if token doesn't exist
        userName,
        email: oldSession.email || 'unknown@example.com',
        loginTime: oldSession.loginTime || new Date().toISOString(),
        loginDate: oldSession.loginDate || new Date().toISOString().split('T')[0],
        expires: oldSession.expires || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
      
      console.log(`📝 New session format:`, {
        sessionId: newSession.sessionId,
        email: newSession.email,
        userName: newSession.userName
      })
      
      // Delete old session document (using old document ID)
      await db.collection('sessions').doc(docId).delete()
      console.log(`🗑️  Deleted old session document: ${docId}`)
      
      // Create new session document (using sessionId as document ID)
      await db.collection('sessions').doc(sessionId).set(newSession)
      console.log(`✅ Created new session document: ${sessionId}`)
      
      migratedSessions.push(newSession)
    }
    
    // Update system config with daily counter
    const systemConfig = jsondb.getSystemConfig()
    const dailyCounters = systemConfig.dailySessionCounters || {}
    dailyCounters[dateKey] = counter - 1
    
    jsondb.putSystemConfig({ dailySessionCounters: dailyCounters })
    console.log(`📊 Updated daily session counter for ${dateKey}: ${counter - 1}`)
    
    console.log(`🎉 Migration completed successfully!`)
    console.log(`📈 Total sessions migrated: ${migratedSessions.length}`)
    
    if (migratedSessions.length > 0) {
      console.log('\n📋 Migrated sessions:')
      migratedSessions.forEach(session => {
        console.log(`  • ${session.sessionId} - ${session.email} (${session.userName})`)
      })
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

// Wait for jsondb to be ready
setTimeout(async () => {
  try {
    await migrateSessions()
    console.log('✅ Session migration script completed')
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration script failed:', error)
    process.exit(1)
  }
}, 2000) // Wait 2 seconds for jsondb initialization