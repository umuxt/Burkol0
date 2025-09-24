import crypto from 'crypto'
import jsondb from '../lib/jsondb.js'

async function run() {
  const quoteId = `smoke-${crypto.randomUUID()}`
  const testEmail = `${quoteId}@test.burkol`
  const sessionToken = `smoke-${crypto.randomUUID()}`

  console.log('🔥 Firestore smoke test starting...')

  // Quote CRUD
  console.log('➡️  Creating test quote...')
  const createdQuote = jsondb.putQuote({
    id: quoteId,
    name: 'Smoke Test User',
    email: `${quoteId}@burkol.test`,
    phone: '+905551112233',
    proj: 'Smoke Test Project',
    status: 'new',
    createdAt: new Date().toISOString(),
    price: 0
  })
  if (!createdQuote || createdQuote.id !== quoteId) {
    throw new Error('Failed to create quote in Firestore')
  }

  console.log('➡️  Reading back created quote...')
  const fetchedQuote = jsondb.getQuote(quoteId)
  if (!fetchedQuote) {
    throw new Error('Created quote not found via jsondb.getQuote')
  }

  console.log('➡️  Updating quote status...')
  const updateResult = jsondb.patchQuote(quoteId, { status: 'review', updatedAt: new Date().toISOString() })
  if (!updateResult) {
    throw new Error('Failed to patch quote status in Firestore')
  }
  const updatedQuote = jsondb.getQuote(quoteId)
  if (!updatedQuote || updatedQuote.status !== 'review') {
    throw new Error('Quote status did not update correctly')
  }

  console.log('➡️  Deleting quote...')
  const deleteResult = jsondb.removeQuote(quoteId)
  if (!deleteResult) {
    throw new Error('Failed to delete quote from Firestore')
  }
  const deletedQuote = jsondb.getQuote(quoteId)
  if (deletedQuote) {
    throw new Error('Quote still present after delete')
  }

  // User CRUD
  console.log('➡️  Creating test user...')
  const user = jsondb.upsertUser({
    email: testEmail,
    plainPassword: 'Smoke123!',
    role: 'tester',
    active: true,
    createdAt: new Date().toISOString()
  })
  if (!user || user.email !== testEmail) {
    throw new Error('Failed to upsert test user')
  }

  console.log('➡️  Verifying created user...')
  const fetchedUser = jsondb.getUser(testEmail)
  if (!fetchedUser) {
    throw new Error('Unable to fetch test user from Firestore')
  }

  console.log('➡️  Soft deleting user...')
  const deletedUser = jsondb.deleteUser(testEmail)
  if (!deletedUser) {
    throw new Error('Failed to delete test user from Firestore')
  }
  const missingUser = jsondb.getUser(testEmail)
  if (missingUser) {
    throw new Error('User still exists after delete')
  }

  // Session lifecycle
  console.log('➡️  Creating session...')
  jsondb.putSession({ token: sessionToken, email: 'smoke@burkol.test', expires: new Date(Date.now() + 60000).toISOString() })
  const session = jsondb.getSession(sessionToken)
  if (!session) {
    throw new Error('Session not found after putSession')
  }

  console.log('➡️  Removing session...')
  jsondb.deleteSession(sessionToken)
  const missingSession = jsondb.getSession(sessionToken)
  if (missingSession) {
    throw new Error('Session still present after delete')
  }

  console.log('✅ Firestore smoke test passed!')
  process.exit(0)
}

run().catch(err => {
  console.error('❌ Firestore smoke test failed:', err)
  process.exitCode = 1
})
