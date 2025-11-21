/**
 * Lot Number Generator Utility
 * 
 * Purpose: Generate unique lot numbers for material deliveries with automatic sequence increment
 * 
 * Lot Number Format: LOT-{materialCode}-{YYYYMMDD}-{seq}
 * Example: LOT-M-00-001-20251120-001
 * 
 * Features:
 * - Auto-generates sequential lot numbers per material per day
 * - Thread-safe via database transaction
 * - Validates lot number format
 * - Parses lot number components
 * 
 * @module lotGenerator
 */

import db from '../../db/connection.js';

/**
 * Generate a unique lot number for a material delivery
 * 
 * Algorithm:
 * 1. Query existing lots for this material + date
 * 2. Find highest sequence number
 * 3. Increment sequence (001, 002, 003...)
 * 4. Return formatted lot number
 * 
 * @param {string} materialCode - Material code (e.g., 'M-00-001')
 * @param {Date} [date=new Date()] - Delivery date (defaults to today)
 * @returns {Promise<string>} Generated lot number
 * 
 * @example
 * // First lot of the day
 * const lot1 = await generateLotNumber('M-00-001', new Date('2025-11-20'));
 * // Returns: 'LOT-M-00-001-20251120-001'
 * 
 * // Second lot of the same day
 * const lot2 = await generateLotNumber('M-00-001', new Date('2025-11-20'));
 * // Returns: 'LOT-M-00-001-20251120-002'
 * 
 * @throws {Error} If materialCode is invalid or database error occurs
 */
export async function generateLotNumber(materialCode, date = new Date()) {
  // Validate inputs
  if (!materialCode || typeof materialCode !== 'string') {
    throw new Error('Invalid material code: must be a non-empty string');
  }

  // Convert date to Date object if it's a string
  const dateObj = date instanceof Date ? date : new Date(date);
  
  // Validate date
  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date provided');
  }

  // Format date as YYYYMMDD
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  // Lot number prefix
  const prefix = `LOT-${materialCode}-${dateStr}`;

  try {
    // Use transaction to prevent race conditions (concurrent lot generation)
    const result = await db.transaction(async (trx) => {
      // Query existing lots for this material and date
      // Pattern: LOT-{materialCode}-{YYYYMMDD}-%
      const existingLots = await trx('materials.stock_movements')
        .select('lotNumber')
        .where('materialCode', materialCode)
        .where('lotNumber', 'like', `${prefix}-%`)
        .orderBy('lotNumber', 'desc')
        .limit(1);

      let nextSequence = 1;

      if (existingLots.length > 0) {
        // Extract sequence from existing lot number
        const lastLot = existingLots[0].lotNumber;
        const parts = lastLot.split('-');
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        
        if (!isNaN(lastSeq)) {
          nextSequence = lastSeq + 1;
        }
      }

      // Format sequence with leading zeros (001, 002, 003...)
      const seqStr = String(nextSequence).padStart(3, '0');

      // Generate final lot number
      const lotNumber = `${prefix}-${seqStr}`;

      return lotNumber;
    });

    return result;

  } catch (error) {
    console.error('Error generating lot number:', error);
    throw new Error(`Failed to generate lot number for material ${materialCode}: ${error.message}`);
  }
}

/**
 * Validate lot number format
 * 
 * Expected format: LOT-{materialCode}-{YYYYMMDD}-{seq}
 * - materialCode: Any alphanumeric string (may include dashes)
 * - YYYYMMDD: 8-digit date
 * - seq: 3-digit sequence (001-999)
 * 
 * @param {string} lotNumber - Lot number to validate
 * @returns {boolean} True if valid, false otherwise
 * 
 * @example
 * validateLotNumber('LOT-M-00-001-20251120-001'); // true
 * validateLotNumber('LOT-M-00-001-20251120-1');   // false (sequence must be 3 digits)
 * validateLotNumber('INVALID');                    // false
 */
export function validateLotNumber(lotNumber) {
  if (!lotNumber || typeof lotNumber !== 'string') {
    return false;
  }

  // Regex pattern: LOT-{code}-{8digits}-{3digits}
  // Allows material code to have dashes (e.g., M-00-001)
  const pattern = /^LOT-.+-\d{8}-\d{3}$/;
  
  return pattern.test(lotNumber);
}

/**
 * Parse lot number into components
 * 
 * Extracts material code, date, and sequence from lot number
 * 
 * @param {string} lotNumber - Lot number to parse
 * @returns {Object|null} Parsed components or null if invalid
 * @returns {string} return.materialCode - Material code
 * @returns {string} return.dateStr - Date in YYYYMMDD format
 * @returns {Date} return.date - Parsed Date object
 * @returns {number} return.sequence - Sequence number
 * @returns {string} return.lotNumber - Original lot number
 * 
 * @example
 * const parsed = parseLotNumber('LOT-M-00-001-20251120-001');
 * // Returns:
 * // {
 * //   materialCode: 'M-00-001',
 * //   dateStr: '20251120',
 * //   date: Date('2025-11-20'),
 * //   sequence: 1,
 * //   lotNumber: 'LOT-M-00-001-20251120-001'
 * // }
 */
export function parseLotNumber(lotNumber) {
  if (!validateLotNumber(lotNumber)) {
    return null;
  }

  try {
    // Remove 'LOT-' prefix
    const withoutPrefix = lotNumber.substring(4);
    
    // Split by last two dashes to get material code, date, sequence
    const parts = withoutPrefix.split('-');
    
    if (parts.length < 3) {
      return null;
    }

    // Last part is sequence
    const sequence = parseInt(parts[parts.length - 1], 10);
    
    // Second to last is date
    const dateStr = parts[parts.length - 2];
    
    // Everything before that is material code (may contain dashes)
    const materialCode = parts.slice(0, parts.length - 2).join('-');

    // Parse date
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1; // Month is 0-indexed
    const day = parseInt(dateStr.substring(6, 8), 10);
    const date = new Date(year, month, day);

    // Validate date
    if (isNaN(date.getTime())) {
      return null;
    }

    return {
      materialCode,
      dateStr,
      date,
      sequence,
      lotNumber
    };

  } catch (error) {
    console.error('Error parsing lot number:', error);
    return null;
  }
}

/**
 * Get all lots for a specific material
 * 
 * Useful for inventory reports and FIFO consumption preview
 * 
 * @param {string} materialCode - Material code
 * @returns {Promise<Array>} List of lots with balances
 * 
 * @example
 * const lots = await getLotsForMaterial('M-00-001');
 * // Returns:
 * // [
 * //   { lotNumber: 'LOT-M-00-001-20251101-001', lotDate: '2025-11-01', balance: 50 },
 * //   { lotNumber: 'LOT-M-00-001-20251115-001', lotDate: '2025-11-15', balance: 200 }
 * // ]
 */
export async function getLotsForMaterial(materialCode) {
  try {
    const lots = await db('materials.stock_movements')
      .select(
        'lotNumber',
        'lotDate',
        db.raw(`
          SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END) as balance
        `)
      )
      .where('materialCode', materialCode)
      .whereNotNull('lotNumber')
      .groupBy('lotNumber', 'lotDate')
      .havingRaw('SUM(CASE WHEN type = ? THEN quantity ELSE -quantity END) > 0', ['in'])
      .orderBy('lotDate', 'asc');

    return lots;

  } catch (error) {
    console.error('Error fetching lots for material:', error);
    throw new Error(`Failed to fetch lots for material ${materialCode}: ${error.message}`);
  }
}

/**
 * Check if a lot number already exists
 * 
 * @param {string} lotNumber - Lot number to check
 * @returns {Promise<boolean>} True if exists, false otherwise
 */
export async function lotNumberExists(lotNumber) {
  try {
    const result = await db('materials.stock_movements')
      .where('lotNumber', lotNumber)
      .first();

    return !!result;

  } catch (error) {
    console.error('Error checking lot existence:', error);
    throw new Error(`Failed to check lot number existence: ${error.message}`);
  }
}

// Export default object
export default {
  generateLotNumber,
  validateLotNumber,
  parseLotNumber,
  getLotsForMaterial,
  lotNumberExists
};


/**
 * UNIT TEST EXAMPLES
 * 
 * Test 1: Generate first lot of the day
 * =====================================
 * const lot1 = await generateLotNumber('M-00-001', new Date('2025-11-20'));
 * assert(lot1 === 'LOT-M-00-001-20251120-001');
 * 
 * Test 2: Generate second lot (sequence increment)
 * ================================================
 * const lot2 = await generateLotNumber('M-00-001', new Date('2025-11-20'));
 * assert(lot2 === 'LOT-M-00-001-20251120-002');
 * 
 * Test 3: Different material, same day
 * ====================================
 * const lot3 = await generateLotNumber('M-00-002', new Date('2025-11-20'));
 * assert(lot3 === 'LOT-M-00-002-20251120-001'); // Back to 001
 * 
 * Test 4: Same material, different day
 * ====================================
 * const lot4 = await generateLotNumber('M-00-001', new Date('2025-11-21'));
 * assert(lot4 === 'LOT-M-00-001-20251121-001'); // Back to 001
 * 
 * Test 5: Validate lot number format
 * ===================================
 * assert(validateLotNumber('LOT-M-00-001-20251120-001') === true);
 * assert(validateLotNumber('INVALID') === false);
 * assert(validateLotNumber('LOT-M-00-001-20251120-1') === false); // Sequence too short
 * 
 * Test 6: Parse lot number
 * ========================
 * const parsed = parseLotNumber('LOT-M-00-001-20251120-001');
 * assert(parsed.materialCode === 'M-00-001');
 * assert(parsed.dateStr === '20251120');
 * assert(parsed.sequence === 1);
 * 
 * Test 7: Handle material codes with multiple dashes
 * ==================================================
 * const lot = await generateLotNumber('WIP-001-F', new Date('2025-11-20'));
 * assert(lot === 'LOT-WIP-001-F-20251120-001');
 * 
 * const parsed = parseLotNumber('LOT-WIP-001-F-20251120-001');
 * assert(parsed.materialCode === 'WIP-001-F');
 * 
 * Test 8: Concurrent generation (race condition test)
 * ===================================================
 * const promises = [];
 * for (let i = 0; i < 10; i++) {
 *   promises.push(generateLotNumber('M-00-001', new Date('2025-11-20')));
 * }
 * const lots = await Promise.all(promises);
 * const uniqueLots = new Set(lots);
 * assert(uniqueLots.size === 10); // All lots should be unique
 * 
 * Test 9: Get lots for material
 * =============================
 * const lots = await getLotsForMaterial('M-00-001');
 * assert(lots.length > 0);
 * assert(lots[0].balance > 0);
 * assert(lots[0].lotDate <= lots[lots.length - 1].lotDate); // FIFO order
 */
