import express from 'express';
import Settings from '../db/models/settings.js';
import { getSession } from './auth.js';
import { cleanupOldLogs } from '../domains/production/api/services/workerActivityLogService.js';

const router = express.Router();

async function withAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || '';
  if (!token && req.hostname !== 'localhost') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    if (token && token.startsWith('dev-')) {
      req.user = { email: 'dev@beeplan.com', userName: 'Dev User' };
    } else if (token) {
      const s = await getSession(token);
      if (s) req.user = s;
    }
  } catch { }
  next();
}

// GET /api/settings/system
router.get('/system', withAuth, async (req, res) => {
  try {
    const config = await Settings.getSetting('system_config');
    // Return default values if not set
    res.json(config || {
      lotTracking: true, // Default ON
      currency: 'TRY',
      dateFormat: 'DD.MM.YYYY',
      workerLogRetentionDays: 30
    });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/settings/system
router.post('/system', withAuth, async (req, res) => {
  try {
    const settings = req.body;
    const updatedBy = req.user?.email || 'system';

    // Merge with existing settings to avoid overwriting other keys
    const current = await Settings.getSetting('system_config') || {};
    const merged = { ...current, ...settings };

    const updated = await Settings.setSetting('system_config', merged, updatedBy);

    // Trigger cleanup job if retention days is set
    if (merged.workerLogRetentionDays) {
      // Run in background, don't await strictly for response
      cleanupOldLogs(merged.workerLogRetentionDays).catch(err =>
        console.error('Error running worker log cleanup:', err)
      );
    }

    res.json(updated.value);
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/settings/:key - Generic settings getter
router.get('/:key', withAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const config = await Settings.getSetting(key);

    if (!config) {
      // Return empty object if not found (will be created on first PUT)
      return res.json({ key, value: null });
    }

    res.json({ key, value: config });
  } catch (error) {
    console.error(`Error fetching settings ${req.params.key}:`, error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings/:key - Generic settings setter
router.put('/:key', withAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const value = req.body;
    const updatedBy = req.user?.email || 'system';

    const updated = await Settings.setSetting(key, value, updatedBy);

    res.json({ key, value: updated.value });
  } catch (error) {
    console.error(`Error updating settings ${req.params.key}:`, error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
