/**
 * Material Categories Model
 * PostgreSQL data access layer for materials.materials_categories table
 */

import db from '../connection.js'

// Table reference with schema
const CATEGORIES_TABLE = 'materials.materials_categories'
const MATERIALS_TABLE = 'materials.materials'

/**
 * Get all categories with material counts
 */
export async function getAllCategories() {
  try {
    const categories = await db(CATEGORIES_TABLE)
      .select(
        'materials.materials_categories.*',
        db.raw('COUNT(materials.materials.id) as "materialCount"')
      )
      .leftJoin(MATERIALS_TABLE, 'materials.materials_categories.id', 'materials.materials.category')
      .groupBy('materials.materials_categories.id')
      .orderBy('materials.materials_categories.sortOrder', 'asc')
      .orderBy('materials.materials_categories.name', 'asc')
    
    return categories.map(c => ({
      ...c,
      materialCount: parseInt(c.materialCount) || 0
    }))
  } catch (error) {
    console.error('❌ Error getting all categories:', error)
    throw error
  }
}

/**
 * Get active categories only
 */
export async function getActiveCategories() {
  try {
    const categories = await db(CATEGORIES_TABLE)
      .select('*')
      .where({ isActive: true })
      .orderBy('sortOrder', 'asc')
      .orderBy('name', 'asc')
    
    return categories
  } catch (error) {
    console.error('❌ Error getting active categories:', error)
    throw error
  }
}

/**
 * Get category by ID
 */
export async function getCategoryById(id) {
  try {
    const category = await db(CATEGORIES_TABLE)
      .where({ id })
      .first()
    
    return category || null
  } catch (error) {
    console.error('❌ Error getting category by ID:', error)
    throw error
  }
}

/**
 * Create new category
 */
export async function createCategory(categoryData) {
  try {
    const [category] = await db(CATEGORIES_TABLE)
      .insert({
        id: categoryData.id,
        name: categoryData.name,
        description: categoryData.description || null,
        parentCategory: categoryData.parent_category || categoryData.parentCategory || null,
        icon: categoryData.icon || null,
        color: categoryData.color || null,
        sortOrder: categoryData.sort_order || categoryData.sortOrder || 0,
        isActive: categoryData.is_active !== false,
        materialCount: 0,
        createdAt: db.fn.now()
      })
      .returning('*')
    
    console.log('✅ Category created:', category.id)
    return category
  } catch (error) {
    console.error('❌ Error creating category:', error)
    throw error
  }
}

/**
 * Update category
 */
export async function updateCategory(id, updates) {
  try {
    const updateData = {
      updatedAt: db.fn.now()
    }
    
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.parent_category !== undefined) updateData.parentCategory = updates.parent_category
    if (updates.parentCategory !== undefined) updateData.parentCategory = updates.parentCategory
    if (updates.icon !== undefined) updateData.icon = updates.icon
    if (updates.color !== undefined) updateData.color = updates.color
    if (updates.sort_order !== undefined) updateData.sortOrder = updates.sort_order
    if (updates.sortOrder !== undefined) updateData.sortOrder = updates.sortOrder
    if (updates.is_active !== undefined) updateData.isActive = updates.is_active
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive
    if (updates.material_count !== undefined) updateData.materialCount = updates.material_count
    if (updates.materialCount !== undefined) updateData.materialCount = updates.materialCount
    
    const [category] = await db(CATEGORIES_TABLE)
      .where({ id })
      .update(updateData)
      .returning('*')
    
    if (!category) {
      throw new Error('Category not found')
    }
    
    console.log('✅ Category updated:', category.id)
    return category
  } catch (error) {
    console.error('❌ Error updating category:', error)
    throw error
  }
}

/**
 * Delete category
 */
export async function deleteCategory(id) {
  try {
    const deleted = await db(CATEGORIES_TABLE)
      .where({ id })
      .delete()
    
    if (deleted === 0) {
      throw new Error('Category not found')
    }
    
    console.log('✅ Category deleted:', id)
    return true
  } catch (error) {
    console.error('❌ Error deleting category:', error)
    throw error
  }
}

/**
 * Get material count for category
 */
export async function getCategoryMaterialCount(categoryId) {
  try {
    // Count materials in this category
    const result = await db(MATERIALS_TABLE)
      .where({ category: categoryId })
      .count('* as count')
      .first()
    
    return parseInt(result.count) || 0
  } catch (error) {
    console.error('❌ Error getting category material count:', error)
    return 0
  }
}

/**
 * Update material count for category
 */
export async function updateCategoryMaterialCount(categoryId) {
  try {
    const count = await getCategoryMaterialCount(categoryId)
    
    await db(CATEGORIES_TABLE)
      .where({ id: categoryId })
      .update({ 
        materialCount: count,
        updatedAt: db.fn.now()
      })
    
    console.log(`✅ Category ${categoryId} material count updated: ${count}`)
    return count
  } catch (error) {
    console.error('❌ Error updating category material count:', error)
    throw error
  }
}

export default {
  getAllCategories,
  getActiveCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryMaterialCount,
  updateCategoryMaterialCount
}
