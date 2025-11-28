/**
 * Holiday Controller
 * HTTP handlers for holiday and timezone management
 */

import * as holidayService from '../services/holidayService.js';

/**
 * GET /api/mes/holidays
 */
export async function getHolidays(req, res) {
  try {
    const holidays = await holidayService.getHolidays();
    res.json({ holidays });
  } catch (error) {
    console.error('❌ Error fetching holidays:', error);
    res.status(500).json({ 
      error: 'Failed to fetch holidays',
      details: error.message 
    });
  }
}

/**
 * POST /api/mes/holidays
 */
export async function createHoliday(req, res) {
  try {
    const holiday = await holidayService.createHoliday(req.body);
    res.status(201).json({ 
      success: true, 
      holiday 
    });
  } catch (error) {
    console.error('❌ Error creating holiday:', error);
    res.status(500).json({ 
      error: 'Failed to create holiday',
      details: error.message 
    });
  }
}

/**
 * PUT /api/mes/holidays/:id
 */
export async function updateHoliday(req, res) {
  try {
    const { id } = req.params;
    const holiday = await holidayService.updateHoliday(id, req.body);
    
    if (!holiday) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    
    res.json({ 
      success: true, 
      holiday 
    });
  } catch (error) {
    console.error('❌ Error updating holiday:', error);
    res.status(500).json({ 
      error: 'Failed to update holiday',
      details: error.message 
    });
  }
}

/**
 * DELETE /api/mes/holidays/:id
 */
export async function deleteHoliday(req, res) {
  try {
    const { id } = req.params;
    const deleted = await holidayService.deleteHoliday(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Holiday deleted successfully' 
    });
  } catch (error) {
    console.error('❌ Error deleting holiday:', error);
    res.status(500).json({ 
      error: 'Failed to delete holiday',
      details: error.message 
    });
  }
}

/**
 * GET /api/mes/timezone
 */
export async function getTimezone(req, res) {
  try {
    const result = await holidayService.getTimezone();
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching timezone:', error);
    res.status(500).json({ 
      error: 'Failed to fetch timezone',
      details: error.message 
    });
  }
}

/**
 * PUT /api/mes/timezone
 */
export async function updateTimezone(req, res) {
  try {
    const { timezone } = req.body;
    const result = await holidayService.updateTimezone(timezone);
    res.json({ 
      success: true, 
      ...result 
    });
  } catch (error) {
    console.error('❌ Error updating timezone:', error);
    res.status(500).json({ 
      error: 'Failed to update timezone',
      details: error.message 
    });
  }
}
