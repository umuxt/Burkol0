/**
 * Category Controller
 * HTTP handlers for material category CRUD operations
 */

import * as categoryService from '../services/categoryService.js';

// CORS headers helper
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export async function getMaterialCategories(req, res) {
  setCorsHeaders(res);
  try {
    const categories = await categoryService.getAllCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching material categories:', error);
    res.status(500).send('Server error while fetching categories');
  }
}

export async function createMaterialCategory(req, res) {
  setCorsHeaders(res);
  try {
    const newCategory = await categoryService.createCategory(req.body);
    res.status(201).json(newCategory);
  } catch (error) {
    if (error.code === 'MISSING_NAME') {
      return res.status(400).send('Category name is required and must be a string');
    }
    console.error('Error adding material category:', error);
    res.status(500).send('Server error');
  }
}

export async function updateMaterialCategory(req, res) {
  setCorsHeaders(res);
  try {
    const { id } = req.params;
    const updatedCategory = await categoryService.updateCategory(id, req.body);
    res.json(updatedCategory);
  } catch (error) {
    if (error.code === 'MISSING_NAME') {
      return res.status(400).send('Category name is required');
    }
    console.error('Error updating material category:', error);
    res.status(500).send('Server error');
  }
}

export async function deleteMaterialCategory(req, res) {
  setCorsHeaders(res);
  try {
    const { id } = req.params;
    const { updateRemoved } = req.query;

    await categoryService.deleteCategory(id, updateRemoved === 'true');
    res.status(204).send();
  } catch (error) {
    if (error.code === 'CATEGORY_IN_USE') {
      return res.status(400).send(error.message);
    }
    console.error('Error deleting material category:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function getMaterialCategoryUsage(req, res) {
  setCorsHeaders(res);
  try {
    const { id } = req.params;
    const usage = await categoryService.getCategoryUsage(id);
    res.json(usage);
  } catch (error) {
    console.error(`Error checking category usage for ID ${req.params.id}:`, error);
    res.status(500).send('Server error while checking category usage');
  }
}
