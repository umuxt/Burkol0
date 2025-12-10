/**
 * Service Cards Model
 * PostgreSQL data access layer for materials.service_cards table
 * Used for invoice line items (services/labor)
 */

import db from '../connection.js'

// Table reference with schema
const SERVICE_CARDS_TABLE = 'materials.service_cards'

/**
 * Get all active service cards
 */
async function getAll(includeInactive = false) {
    const query = db(SERVICE_CARDS_TABLE)
        .select('*')
        .orderBy('name')

    if (!includeInactive) {
        query.where('isActive', true)
    }

    return query
}

/**
 * Get service card by ID
 */
async function getById(id) {
    return db(SERVICE_CARDS_TABLE)
        .where('id', id)
        .first()
}

/**
 * Get service card by code
 */
async function getByCode(code) {
    return db(SERVICE_CARDS_TABLE)
        .where('code', code)
        .first()
}

/**
 * Generate next service card code
 * Format: SRV-XXX (finds next available number)
 */
async function generateCode(prefix = 'SRV') {
    // Get all codes starting with prefix
    const existing = await db(SERVICE_CARDS_TABLE)
        .select('code')
        .where('code', 'like', `${prefix}-%`)

    // Extract numbers and find the max
    let maxNumber = 0
    for (const row of existing) {
        const match = row.code.match(new RegExp(`^${prefix}-(\\d+)$`))
        if (match) {
            const num = parseInt(match[1], 10)
            if (num > maxNumber) maxNumber = num
        }
    }

    const nextNumber = maxNumber + 1
    return `${prefix}-${String(nextNumber).padStart(3, '0')}`
}

/**
 * Create new service card
 */
async function create(data) {
    // Generate code if not provided
    if (!data.code) {
        data.code = await generateCode()
    }

    // Check for duplicate code
    const existing = await getByCode(data.code)
    if (existing) {
        throw new Error(`Service card with code ${data.code} already exists`)
    }

    const insertData = {
        code: data.code,
        name: data.name,
        category: data.category || 'Other',
        unit: data.unit || 'Adet',
        defaultPrice: data.defaultPrice || null,
        vatRate: data.vatRate || 20,
        taxExempt: data.taxExempt || false,
        glCode: data.glCode || null,
        notes: data.notes || null,
        isActive: data.isActive !== false
    }

    const [created] = await db(SERVICE_CARDS_TABLE)
        .insert(insertData)
        .returning('*')

    return created
}

/**
 * Update service card
 */
async function update(id, updates) {
    // If changing code, check for duplicates
    if (updates.code) {
        const existing = await db(SERVICE_CARDS_TABLE)
            .where('code', updates.code)
            .whereNot('id', id)
            .first()

        if (existing) {
            throw new Error(`Service card with code ${updates.code} already exists`)
        }
    }

    const allowedFields = [
        'code', 'name', 'category', 'unit', 'defaultPrice',
        'vatRate', 'taxExempt', 'glCode', 'notes', 'isActive'
    ]

    const updateData = {}
    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            updateData[field] = updates[field]
        }
    }

    if (Object.keys(updateData).length === 0) {
        return getById(id)
    }

    const [updated] = await db(SERVICE_CARDS_TABLE)
        .where('id', id)
        .update(updateData)
        .returning('*')

    return updated
}

/**
 * Soft delete service card (set isActive = false)
 */
async function softDelete(id) {
    const [deleted] = await db(SERVICE_CARDS_TABLE)
        .where('id', id)
        .update({ isActive: false })
        .returning('*')

    return deleted
}

/**
 * Hard delete service card (permanent)
 */
async function hardDelete(id) {
    // Check if used in any shipment items
    const usedInShipments = await db('materials.shipment_items')
        .where('serviceCardId', id)
        .first()

    if (usedInShipments) {
        throw new Error('Cannot delete service card that is used in shipments')
    }

    const deleted = await db(SERVICE_CARDS_TABLE)
        .where('id', id)
        .del()

    return deleted > 0
}

/**
 * Get service cards by category
 */
async function getByCategory(category) {
    return db(SERVICE_CARDS_TABLE)
        .where('category', category)
        .where('isActive', true)
        .orderBy('name')
}

/**
 * Get distinct categories
 */
async function getCategories() {
    const results = await db(SERVICE_CARDS_TABLE)
        .distinct('category')
        .whereNotNull('category')
        .orderBy('category')

    return results.map(r => r.category)
}

export default {
    getAll,
    getById,
    getByCode,
    generateCode,
    create,
    update,
    softDelete,
    hardDelete,
    getByCategory,
    getCategories
}
