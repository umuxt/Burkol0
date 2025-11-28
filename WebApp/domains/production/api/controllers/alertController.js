import * as alertService from '../services/alertService.js';

export const getAlerts = async (req, res) => {
  try {
    const { type, status, limit } = req.query;
    const alerts = await alertService.getAlerts({ type, status, limit });
    res.json({ alerts });
  } catch (error) {
    console.error('❌ Error fetching alerts:', error);
    res.status(500).json({ 
      error: 'Failed to fetch alerts',
      details: error.message,
      alerts: [] // Return empty array as fallback
    });
  }
};

export const createAlert = async (req, res) => {
  try {
    const { type, severity, title, message, metadata } = req.body;
    
    if (!type || !title) {
      return res.status(400).json({ error: 'Type and title are required' });
    }
    
    const alert = await alertService.createAlert({ type, severity, title, message, metadata });
    res.status(201).json(alert);
  } catch (error) {
    console.error('❌ Error creating alert:', error);
    res.status(500).json({ 
      error: 'Failed to create alert',
      details: error.message
    });
  }
};

export const markAsRead = async (req, res) => {
  const { id } = req.params;
  
  try {
    const alert = await alertService.markAsRead(id);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json(alert);
  } catch (error) {
    console.error('❌ Error marking alert as read:', error);
    res.status(500).json({ 
      error: 'Failed to mark alert as read',
      details: error.message
    });
  }
};

export const resolveAlert = async (req, res) => {
  const { id } = req.params;
  const { resolvedBy } = req.body;
  
  try {
    const alert = await alertService.resolveAlert(id, resolvedBy);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json(alert);
  } catch (error) {
    console.error('❌ Error resolving alert:', error);
    res.status(500).json({ 
      error: 'Failed to resolve alert',
      details: error.message
    });
  }
};
