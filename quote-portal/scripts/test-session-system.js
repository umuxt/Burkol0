#!/usr/bin/env node

// Test script for new session management system

import { createSession, getSession, generateSessionId } from '../server/auth.js'
import jsondb from '../src/lib/jsondb.js'

async function testNewSessionSystem() {
  console.log('🧪 Testing new session management system...\n')
  
  // Wait for jsondb to be ready
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Test 1: Session ID generation
  console.log('📋 Test 1: Session ID Generation')
  for (let i = 0; i < 5; i++) {
    const sessionId = generateSessionId()
    console.log(`  Generated ID ${i + 1}: ${sessionId}`)
  }
  console.log()
  
  // Test 2: Create test user
  console.log('📋 Test 2: Create Test User')
  const testUser = {
    email: 'test@burkol.com',
    name: 'Test User',
    role: 'admin',
    plainPassword: 'test123',
    active: true
  }
  
  jsondb.upsertUser(testUser)
  console.log(`  ✅ Created user: ${testUser.email} (${testUser.name})`)
  console.log()
  
  // Test 3: Create sessions
  console.log('📋 Test 3: Create Sessions')
  const tokens = []
  
  for (let i = 0; i < 3; i++) {
    const token = createSession(testUser.email)
    tokens.push(token)
    const session = getSession(token)
    
    console.log(`  Session ${i + 1}:`)
    console.log(`    Token: ${token}`)
    console.log(`    Session ID: ${session.sessionId}`)
    console.log(`    User Name: ${session.userName}`)
    console.log(`    Email: ${session.email}`)
    console.log(`    Login Time: ${session.loginTime}`)
    console.log(`    Login Date: ${session.loginDate}`)
    console.log(`    Expires: ${session.expires}`)
    console.log()
  }
  
  // Test 4: List all sessions
  console.log('📋 Test 4: List All Sessions')
  const allSessions = jsondb.getAllSessions()
  console.log(`  Total sessions: ${allSessions.length}`)
  allSessions.forEach((session, index) => {
    console.log(`  ${index + 1}. ${session.sessionId} - ${session.email} (${session.userName})`)
  })
  console.log()
  
  // Test 5: Session lookup by ID
  console.log('📋 Test 5: Session Lookup by ID')
  if (allSessions.length > 0) {
    const firstSession = allSessions[0]
    const foundSession = jsondb.getSessionById(firstSession.sessionId)
    console.log(`  Lookup session ID: ${firstSession.sessionId}`)
    console.log(`  Found: ${foundSession ? '✅' : '❌'}`)
    if (foundSession) {
      console.log(`  Email: ${foundSession.email}`)
      console.log(`  User Name: ${foundSession.userName}`)
    }
  }
  console.log()
  
  // Test 6: Delete session by ID
  console.log('📋 Test 6: Delete Session by ID')
  if (allSessions.length > 0) {
    const sessionToDelete = allSessions[0]
    console.log(`  Deleting session: ${sessionToDelete.sessionId}`)
    const deleted = jsondb.deleteSessionById(sessionToDelete.sessionId)
    console.log(`  Deleted: ${deleted ? '✅' : '❌'}`)
    
    const remainingSessions = jsondb.getAllSessions()
    console.log(`  Remaining sessions: ${remainingSessions.length}`)
  }
  console.log()
  
  // Test 7: System config daily counters
  console.log('📋 Test 7: System Config Daily Counters')
  const systemConfig = jsondb.getSystemConfig()
  const dailyCounters = systemConfig.dailySessionCounters || {}
  
  console.log('  Daily session counters:')
  Object.entries(dailyCounters).forEach(([date, count]) => {
    console.log(`    ${date}: ${count} sessions`)
  })
  console.log()
  
  // Cleanup
  console.log('🧹 Cleanup')
  tokens.forEach(token => {
    const session = getSession(token)
    if (session) {
      jsondb.deleteSession(token)
      console.log(`  Deleted session with token: ${token.substring(0, 10)}...`)
    }
  })
  
  jsondb.deleteUser(testUser.email)
  console.log(`  Deleted test user: ${testUser.email}`)
  
  console.log('\n🎉 All tests completed successfully!')
}

testNewSessionSystem().catch(error => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})