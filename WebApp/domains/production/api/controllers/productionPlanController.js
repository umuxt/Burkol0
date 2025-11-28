import * as productionPlanService from '../services/productionPlanService.js';

export const getProductionPlans = async (req, res) => {
  try {
    const plans = await productionPlanService.getProductionPlans();
    res.json({ productionPlans: plans });
  } catch (error) {
    console.error('❌ Error fetching production plans:', error);
    res.status(500).json({ 
      error: 'Failed to fetch production plans',
      details: error.message 
    });
  }
};

export const getProductionPlanById = async (req, res) => {
  try {
    const plan = await productionPlanService.getProductionPlanById(req.params.id);
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    res.json(plan);
  } catch (error) {
    console.error('❌ Error fetching plan:', error);
    res.status(500).json({ 
      error: 'Failed to fetch plan',
      details: error.message 
    });
  }
};

export const createProductionPlan = async (req, res) => {
  try {
    const plan = await productionPlanService.createProductionPlan(req.body);
    res.json(plan);
  } catch (error) {
    if (error.code === 'MISSING_ORDER_CODE') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'MISSING_NODES') {
      return res.status(400).json({ error: error.message });
    }
    console.error('❌ Error creating production plan:', error);
    res.status(500).json({ 
      error: 'Failed to create production plan',
      details: error.message 
    });
  }
};

export const updateProductionPlan = async (req, res) => {
  try {
    const plan = await productionPlanService.updateProductionPlan(req.params.id, req.body);
    res.json(plan);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Plan not found' });
    }
    console.error('❌ Error updating plan:', error);
    res.status(500).json({ 
      error: 'Failed to update plan',
      details: error.message 
    });
  }
};

export const deleteProductionPlan = async (req, res) => {
  try {
    await productionPlanService.deleteProductionPlan(req.params.id);
    res.json({ success: true, message: 'Plan deleted successfully' });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Plan not found' });
    }
    if (error.code === 'HAS_ACTIVE_ASSIGNMENTS') {
      return res.status(400).json({ error: error.message });
    }
    console.error('❌ Error deleting plan:', error);
    res.status(500).json({ 
      error: 'Failed to delete plan',
      details: error.message 
    });
  }
};

export const pauseProductionPlan = async (req, res) => {
  try {
    const plan = await productionPlanService.pauseProductionPlan(req.params.id);
    res.json({ success: true, plan });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Plan not found' });
    }
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: error.message });
    }
    console.error('❌ Error pausing plan:', error);
    res.status(500).json({ 
      error: 'Failed to pause plan',
      details: error.message 
    });
  }
};

export const resumeProductionPlan = async (req, res) => {
  try {
    const plan = await productionPlanService.resumeProductionPlan(req.params.id);
    res.json({ success: true, plan });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Plan not found' });
    }
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: error.message });
    }
    console.error('❌ Error resuming plan:', error);
    res.status(500).json({ 
      error: 'Failed to resume plan',
      details: error.message 
    });
  }
};

export const launchProductionPlan = async (req, res) => {
  try {
    const result = await productionPlanService.launchProductionPlan(req.params.id);
    
    if (result.error) {
      return res.status(400).json({ error: result.error, details: result.details });
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error launching plan:', error);
    res.status(500).json({ 
      error: 'Failed to launch plan',
      details: error.message 
    });
  }
};
