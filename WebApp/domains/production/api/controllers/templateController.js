import * as templateService from '../services/templateService.js';

export const getTemplates = async (req, res) => {
  try {
    const templates = await templateService.getAllTemplates();
    res.json({ templates });
  } catch (error) {
    console.error('❌ Error fetching templates:', error);
    res.status(500).json({ 
      error: 'Failed to fetch templates',
      details: error.message 
    });
  }
};

export const saveTemplate = async (req, res) => {
  try {
    const result = await templateService.saveTemplate(req.body);
    res.json({ 
      success: true, 
      id: result.id,
      nodeCount: result.nodeCount,
      message: `Template ${result.id} saved successfully`
    });
  } catch (error) {
    // Handle specific errors
    if (error.message === 'TEMPLATE_NOT_FOUND') {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Handle duplicate key error
    if (error.code === '23505') {
      const workOrderCode = req.body.workOrderCode || req.body.orderCode;
      return res.status(409).json({ 
        error: `${workOrderCode} için plan tasarlanmış plan var`,
        workOrderCode
      });
    }
    
    console.error('❌ Error saving template:', error);
    res.status(500).json({ 
      error: 'Failed to save template',
      details: error.message 
    });
  }
};

export const deleteTemplate = async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await templateService.deleteTemplate(id);
    
    if (!result) {
      return res.status(404).json({ 
        error: 'Template not found or not a template' 
      });
    }
    
    res.json({ 
      success: true, 
      id,
      message: `Template ${id} deleted successfully`
    });
  } catch (error) {
    console.error('❌ Error deleting template:', error);
    res.status(500).json({ 
      error: 'Failed to delete template',
      details: error.message 
    });
  }
};
