/**
 * Material Controller
 * HTTP handlers for material CRUD operations
 */

import * as materialService from '../services/materialService.js';

export async function getMaterials(req, res) {
  try {
    const materials = await materialService.getMaterials();
    res.json(materials);
  } catch (error) {
    console.error('Error getting materials:', error);
    res.status(500).json({ error: 'Failed to get materials' });
  }
}

export async function getAllMaterials(req, res) {
  try {
    const materials = await materialService.getAllMaterials();
    res.json(materials);
  } catch (error) {
    console.error('Error getting all materials:', error);
    res.status(500).json({ error: 'Failed to get materials' });
  }
}

export async function getActiveMaterials(req, res) {
  try {
    const materials = await materialService.getActiveMaterials();
    res.json(materials);
  } catch (error) {
    console.error('Error getting active materials:', error);
    res.status(500).json({ error: 'Failed to get materials' });
  }
}

export async function createMaterial(req, res) {
  try {
    const createdBy = req.body.createdBy || req.user?.email;
    const material = await materialService.createMaterial(req.body, createdBy);
    res.status(201).json(material);
  } catch (error) {
    console.error('Error creating material:', error);
    res.status(500).json({ error: 'Failed to create material', details: error.message });
  }
}

export async function updateMaterial(req, res) {
  try {
    const { id } = req.params;
    const material = await materialService.updateMaterial(id, req.body);
    res.json(material);
  } catch (error) {
    console.error('Error updating material:', error);
    res.status(500).json({ error: 'Failed to update material', details: error.message });
  }
}

export async function deleteMaterial(req, res) {
  try {
    const { id } = req.params;
    await materialService.deleteMaterial(id);
    res.json({ message: 'Material deleted successfully' });
  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).json({ error: 'Failed to delete material' });
  }
}

export async function permanentDeleteMaterial(req, res) {
  try {
    const { id } = req.params;
    await materialService.permanentDeleteMaterial(id);
    res.json({ message: 'Material permanently deleted' });
  } catch (error) {
    console.error('Error permanently deleting material:', error);
    res.status(500).json({ error: 'Failed to permanently delete material' });
  }
}

export async function batchCreateMaterials(req, res) {
  try {
    const { materials } = req.body;
    if (!materials || !Array.isArray(materials)) {
      return res.status(400).json({ error: 'Materials array is required' });
    }

    const createdBy = req.user?.email || 'batch-import';
    const results = await materialService.batchCreateMaterials(materials, createdBy);
    res.json(results);
  } catch (error) {
    console.error('Batch create materials error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function getMaterialsByCategory(req, res) {
  try {
    const { category } = req.params;
    const materials = await materialService.getMaterialsByCategory(category);
    res.json(materials);
  } catch (error) {
    console.error('Error getting materials by category:', error);
    res.status(500).json({ error: 'Failed to get materials' });
  }
}

export async function getMaterialsBySupplier(req, res) {
  try {
    const { supplierId } = req.params;
    const materials = await materialService.getMaterialsBySupplier(supplierId);
    res.json(materials);
  } catch (error) {
    console.error('Error getting materials by supplier:', error);
    res.status(500).json({ error: 'Failed to get materials' });
  }
}

export async function getCategories(req, res) {
  try {
    const categories = await materialService.getCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
}
