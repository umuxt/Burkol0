// PostgreSQL Database Connection Pool
// This module manages the database connection for BeePlan

import knex from 'knex';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'beeplan_dev',
    user: process.env.DB_USER || 'umutyalcin',
    password: process.env.DB_PASSWORD || ''
  },
  pool: {
    min: 2,
    max: 10,
    afterCreate: (conn, done) => {
      // Run after connection is established
      console.log('✅ PostgreSQL connection established');
      done(null, conn);
    }
  },
  acquireConnectionTimeout: 10000
};

// Create the database instance
const db = knex(config);

// Test connection
export async function testConnection() {
  try {
    await db.raw('SELECT 1+1 AS result');
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Graceful shutdown
export async function closeConnection() {
  try {
    await db.destroy();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database connection:', error.message);
  }
}

export default db;
