/**
 * Category Service
 * Handles material category CRUD operations
 */

import MaterialCategories from '#db/models/materialCategories';
import db from '#db/connection';

const MATERIALS_TABLE = 'materials.materials';

/**
 * Get all categories
 */
export async function getAllCategories() {
  return MaterialCategories.getAllCategories();
}

/**
 * Get category by ID
 */
export async function getCategoryById(id) {
  return MaterialCategories.getCategoryById(id);
}

/**
 * Create new category
 */
export async function createCategory(data) {
  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    const error = new Error('Category name is required');
    error.code = 'MISSING_NAME';
    throw error;
  }

  const categoryId = data.id || `cat_${Date.now()}`;

  return MaterialCategories.createCategory({
    id: categoryId,
    name: data.name.trim(),
    description: data.description || null,
    parentCategory: data.parentCategory || data.parent_category || null,
    icon: data.icon || null,
    color: data.color || null,
    sortOrder: data.sortOrder || data.sort_order || 0
  });
}

/**
 * Update category
 */
export async function updateCategory(id, updates) {
  if (!updates.name || updates.name.trim() === '') {
    const error = new Error('Category name is required');
    error.code = 'MISSING_NAME';
    throw error;
  }

  return MaterialCategories.updateCategory(id, {
    name: updates.name.trim(),
    description: updates.description,
    parentCategory: updates.parentCategory || updates.parent_category,
    icon: updates.icon,
    color: updates.color,
    sortOrder: updates.sortOrder || updates.sort_order
  });
}

/**
 * Delete category
 */
export async function deleteCategory(id, updateRemoved = false) {
  // Get materials in this category
  const categoryMaterials = await db(MATERIALS_TABLE)
    .where({ category: id })
    .select('*');

  // Check for active materials
  const activeMaterials = categoryMaterials.filter(m => m.status !== 'Kaldırıldı');

  if (activeMaterials.length > 0) {
    const materialInUse = activeMaterials[0];
    const error = new Error(
      `Kullanımda olan kategoriler kaldırılamaz. ${materialInUse.name} malzemesi hala bu kategoriyi kullanıyor.`
    );
    error.code = 'CATEGORY_IN_USE';
    throw error;
  }

  // Update removed materials if requested
  if (updateRemoved) {
    const removedMaterials = categoryMaterials.filter(m => m.status === 'Kaldırıldı');

    if (removedMaterials.length > 0) {
      await db(MATERIALS_TABLE)
        .where({ category: id })
        .whereIn('code', removedMaterials.map(m => m.code))
        .update({ category: null });

      console.log(`✅ Updated ${removedMaterials.length} removed materials`);
    }
  }

  await MaterialCategories.deleteCategory(id);
  console.log(`✅ Category ${id} deleted successfully`);

  return { success: true };
}

/**
 * Get category usage (materials count)
 */
export async function getCategoryUsage(id) {
  const allMaterials = await db(MATERIALS_TABLE)
    .where({ category: id })
    .select('*');

  const activeMaterials = allMaterials.filter(m => m.status !== 'Kaldırıldı');
  const removedMaterials = allMaterials.filter(m => m.status === 'Kaldırıldı');

  return {
    active: activeMaterials.length,
    removed: removedMaterials.length,
    activeMaterials,
    removedMaterials
  };
}
