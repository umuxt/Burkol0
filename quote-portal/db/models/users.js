/**
 * Users Data Access Layer for PostgreSQL
 */

import db from '../connection.js';

/**
 * Get all users
 */
export async function getAllUsers() {
  try {
    const users = await db('users')
      .select('*')
      .orderBy('created_at', 'desc');
    
    return users;
  } catch (error) {
    console.error('❌ Error getting all users:', error);
    throw error;
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(email) {
  try {
    const user = await db('users')
      .where({ email })
      .first();
    
    return user || null;
  } catch (error) {
    console.error('❌ Error getting user by email:', error);
    throw error;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(id) {
  try {
    const user = await db('users')
      .where({ id })
      .first();
    
    return user || null;
  } catch (error) {
    console.error('❌ Error getting user by ID:', error);
    throw error;
  }
}

/**
 * Create new user
 */
export async function createUser(userData) {
  try {
    // If password is provided, store it as plain_password for now
    const insertData = {
      email: userData.email,
      name: userData.name || userData.email.split('@')[0],
      role: userData.role || 'admin',
      active: userData.active !== false,
      pw_hash: userData.pw_hash || null,
      pw_salt: userData.pw_salt || null,
      worker_id: userData.workerId || userData.worker_id || null,
      created_at: db.fn.now()
    };
    
    // Store plain password if provided (for migration compatibility)
    if (userData.password) {
      insertData.plain_password = userData.password;
    } else if (userData.plainPassword || userData.plain_password) {
      insertData.plain_password = userData.plainPassword || userData.plain_password;
    }
    
    const [user] = await db('users')
      .insert(insertData)
      .returning('*');
    
    console.log('✅ User created:', user.email);
    return user;
  } catch (error) {
    console.error('❌ Error creating user:', error);
    throw error;
  }
}

/**
 * Update user
 */
export async function updateUser(email, updates) {
  try {
    const [user] = await db('users')
      .where({ email })
      .update({
        name: updates.name,
        role: updates.role,
        active: updates.active,
        pw_hash: updates.pw_hash,
        pw_salt: updates.pw_salt,
        plain_password: updates.plainPassword || updates.plain_password,
        worker_id: updates.workerId || updates.worker_id,
        deactivated_at: updates.active === false ? db.fn.now() : null
      })
      .returning('*');
    
    if (!user) {
      throw new Error('User not found');
    }
    
    console.log('✅ User updated:', user.email);
    return user;
  } catch (error) {
    console.error('❌ Error updating user:', error);
    throw error;
  }
}

/**
 * Upsert user (create or update)
 */
export async function upsertUser(userData) {
  try {
    const existing = await getUserByEmail(userData.email);
    
    if (existing) {
      return await updateUser(userData.email, userData);
    } else {
      return await createUser(userData);
    }
  } catch (error) {
    console.error('❌ Error upserting user:', error);
    throw error;
  }
}

/**
 * Delete user (soft delete)
 */
export async function deleteUser(email) {
  try {
    const [user] = await db('users')
      .where({ email })
      .update({
        active: false,
        deactivated_at: db.fn.now()
      })
      .returning('*');
    
    if (!user) {
      throw new Error('User not found');
    }
    
    console.log('✅ User deactivated:', user.email);
    return user;
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    throw error;
  }
}

/**
 * Verify user credentials
 */
export async function verifyUserCredentials(email, password, hashPassword) {
  try {
    const user = await getUserByEmail(email);
    
    if (!user) {
      console.log('❌ User not found:', email);
      return null;
    }
    
    if (!user.active) {
      console.log('❌ User deactivated:', email);
      return { error: 'account_deactivated', message: 'Hesabınız devre dışı bırakılmış.' };
    }
    
    // Plain password check (for backward compatibility)
    if (user.plain_password && user.plain_password === password) {
      console.log('✅ User verified with plain password:', email);
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        workerId: user.worker_id
      };
    }
    
    // Hash-based authentication
    if (user.pw_hash && user.pw_salt && hashPassword) {
      const { hash } = hashPassword(password, user.pw_salt);
      if (hash === user.pw_hash) {
        console.log('✅ User verified with hash:', email);
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
          workerId: user.worker_id
        };
      }
    }
    
    console.log('❌ Invalid password for user:', email);
    return null;
  } catch (error) {
    console.error('❌ Error verifying user credentials:', error);
    return null;
  }
}

export default {
  getAllUsers,
  getUserByEmail,
  getUserById,
  createUser,
  updateUser,
  upsertUser,
  deleteUser,
  verifyUserCredentials
};
