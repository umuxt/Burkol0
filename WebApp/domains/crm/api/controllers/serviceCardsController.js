/**
 * Service Cards Controller
 * API endpoints for managing service cards
 * Used for invoice line items (services/labor)
 */

import ServiceCards from '../../../../db/models/serviceCards.js'

/**
 * GET /api/service-cards
 * Get all active service cards
 */
export async function getAllServiceCards(req, res) {
    try {
        const includeInactive = req.query.includeInactive === 'true'
        const cards = await ServiceCards.getAll(includeInactive)

        console.log(`ℹ GET /api/service-cards - Found ${cards.length} service cards`)
        res.json(cards)
    } catch (error) {
        console.error('Error fetching service cards:', error)
        res.status(500).json({ error: 'Failed to fetch service cards' })
    }
}

/**
 * GET /api/service-cards/categories
 * Get distinct categories
 */
export async function getCategories(req, res) {
    try {
        const categories = await ServiceCards.getCategories()
        res.json(categories)
    } catch (error) {
        console.error('Error fetching categories:', error)
        res.status(500).json({ error: 'Failed to fetch categories' })
    }
}

/**
 * GET /api/service-cards/:id
 * Get service card by ID
 */
export async function getServiceCardById(req, res) {
    try {
        const { id } = req.params
        const card = await ServiceCards.getById(id)

        if (!card) {
            return res.status(404).json({ error: 'Service card not found' })
        }

        res.json(card)
    } catch (error) {
        console.error('Error fetching service card:', error)
        res.status(500).json({ error: 'Failed to fetch service card' })
    }
}

/**
 * POST /api/service-cards
 * Create new service card
 */
export async function createServiceCard(req, res) {
    try {
        const { name, code, category, unit, defaultPrice, vatRate, taxExempt, glCode, notes } = req.body

        if (!name) {
            return res.status(400).json({ error: 'Name is required' })
        }

        const card = await ServiceCards.create({
            name,
            code,
            category,
            unit,
            defaultPrice,
            vatRate,
            taxExempt,
            glCode,
            notes
        })

        console.log(`✅ Service card created: ${card.code} - ${card.name}`)
        res.status(201).json(card)
    } catch (error) {
        console.error('Error creating service card:', error)

        if (error.message.includes('already exists')) {
            return res.status(409).json({ error: error.message })
        }

        res.status(500).json({ error: 'Failed to create service card' })
    }
}

/**
 * PATCH /api/service-cards/:id
 * Update service card
 */
export async function updateServiceCard(req, res) {
    try {
        const { id } = req.params
        const updates = req.body

        const existing = await ServiceCards.getById(id)
        if (!existing) {
            return res.status(404).json({ error: 'Service card not found' })
        }

        const card = await ServiceCards.update(id, updates)

        console.log(`✅ Service card updated: ${card.code}`)
        res.json(card)
    } catch (error) {
        console.error('Error updating service card:', error)

        if (error.message.includes('already exists')) {
            return res.status(409).json({ error: error.message })
        }

        res.status(500).json({ error: 'Failed to update service card' })
    }
}

/**
 * DELETE /api/service-cards/:id
 * Soft delete service card
 */
export async function deleteServiceCard(req, res) {
    try {
        const { id } = req.params
        const permanent = req.query.permanent === 'true'

        const existing = await ServiceCards.getById(id)
        if (!existing) {
            return res.status(404).json({ error: 'Service card not found' })
        }

        if (permanent) {
            await ServiceCards.hardDelete(id)
            console.log(`🗑 Service card permanently deleted: ${existing.code}`)
        } else {
            await ServiceCards.softDelete(id)
            console.log(`🗑 Service card deactivated: ${existing.code}`)
        }

        res.json({ success: true, message: permanent ? 'Permanently deleted' : 'Deactivated' })
    } catch (error) {
        console.error('Error deleting service card:', error)

        if (error.message.includes('used in shipments')) {
            return res.status(409).json({ error: error.message })
        }

        res.status(500).json({ error: 'Failed to delete service card' })
    }
}

export default {
    getAllServiceCards,
    getCategories,
    getServiceCardById,
    createServiceCard,
    updateServiceCard,
    deleteServiceCard
}
