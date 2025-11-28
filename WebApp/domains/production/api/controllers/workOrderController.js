import * as workOrderService from '../services/workOrderService.js';

export const getWorkOrders = async (req, res) => {
  try {
    const workOrders = await workOrderService.getAllWorkOrders();
    res.json({ workOrders });
  } catch (error) {
    console.error('Error fetching work orders:', error);
    res.status(500).json({ error: 'Failed to fetch work orders' });
  }
};

export const createWorkOrder = async (req, res) => {
  const { quoteId, status, data } = req.body;
  
  try {
    const workOrder = await workOrderService.createWorkOrder({ quoteId, status, data });
    res.json({ success: true, ...workOrder });
  } catch (error) {
    console.error('Error creating work order:', error);
    res.status(500).json({ error: 'Failed to create work order' });
  }
};

export const updateWorkOrder = async (req, res) => {
  const { id } = req.params;
  const { quoteId, status, data } = req.body; // destructuring quote_id to quoteId

  try {
    const workOrder = await workOrderService.updateWorkOrder(id, { quoteId, status, data });
    
    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    
    res.json({ success: true, ...workOrder });
  } catch (error) {
    console.error('Error updating work order:', error);
    res.status(500).json({ error: 'Failed to update work order' });
  }
};

export const deleteWorkOrder = async (req, res) => {
  const { id } = req.params;
  
  try {
    const deleted = await workOrderService.deleteWorkOrder(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    
    res.json({ success: true, id: deleted.id });
  } catch (error) {
    console.error('Error deleting work order:', error);
    res.status(500).json({ error: 'Failed to delete work order' });
  }
};

export const getNextWorkOrderCode = async (req, res) => {
  try {
    const nextCode = await workOrderService.getNextWorkOrderCode();
    res.json({ nextCode });
  } catch (error) {
    console.error('Error generating next work order code:', error);
    res.status(500).json({ error: 'Failed to generate next code' });
  }
};
