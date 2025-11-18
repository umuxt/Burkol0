/**
 * Test script for PostgreSQL authentication
 * Creates a test user and verifies login
 */

import * as Users from '../db/models/users.js';
import * as Sessions from '../db/models/sessions.js';
import { hashPassword } from '../server/auth.js';
import { closeConnection } from '../db/connection.js';

async function testAuth() {
  console.log('🧪 Testing PostgreSQL Authentication\n');
  
  try {
    // 1. Create test user
    console.log('📝 Creating test user...');
    const { salt, hash } = hashPassword('test123');
    
    const testUser = {
      email: 'test@beeplan.com',
      name: 'Test User',
      role: 'admin',
      pw_salt: salt,
      pw_hash: hash,
      plainPassword: 'test123', // For backward compatibility
      active: true
    };
    
    try {
      await Users.createUser(testUser);
      console.log('✅ Test user created successfully\n');
    } catch (error) {
      if (error.message.includes('unique')) {
        console.log('ℹ️  Test user already exists\n');
      } else {
        throw error;
      }
    }
    
    // 2. Test user verification
    console.log('🔐 Testing login with plain password...');
    const verifiedUser = await Users.verifyUserCredentials('test@beeplan.com', 'test123', hashPassword);
    
    if (verifiedUser && verifiedUser.email) {
      console.log('✅ Login successful!');
      console.log('   User:', verifiedUser.name);
      console.log('   Email:', verifiedUser.email);
      console.log('   Role:', verifiedUser.role);
      console.log();
    } else {
      console.log('❌ Login failed!');
      return;
    }
    
    // 3. Test session creation
    console.log('📋 Creating session...');
    const sessionData = {
      sessionId: 'test-session-001',
      token: 'test-token-abc123',
      email: verifiedUser.email,
      userName: verifiedUser.name,
      workerId: verifiedUser.workerId,
      loginTime: new Date().toISOString(),
      loginDate: new Date().toISOString().split('T')[0],
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      lastActivityAt: new Date().toISOString(),
      isActive: true,
      activityLog: []
    };
    
    await Sessions.createSession(sessionData);
    console.log('✅ Session created\n');
    
    // 4. Test session retrieval
    console.log('🔍 Retrieving session...');
    const retrievedSession = await Sessions.getSessionByToken('test-token-abc123');
    
    if (retrievedSession) {
      console.log('✅ Session retrieved successfully');
      console.log('   Session ID:', retrievedSession.sessionId);
      console.log('   Email:', retrievedSession.email);
      console.log('   Expires:', retrievedSession.expires);
      console.log();
    } else {
      console.log('❌ Session not found');
    }
    
    // 5. List all users
    console.log('👥 Listing all users...');
    const allUsers = await Users.getAllUsers();
    console.log(`✅ Found ${allUsers.length} users`);
    allUsers.forEach(user => {
      console.log(`   - ${user.email} (${user.role}) ${user.active ? '✓' : '✗'}`);
    });
    console.log();
    
    console.log('🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}

testAuth();
