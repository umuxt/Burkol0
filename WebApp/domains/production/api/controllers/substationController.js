import * as substationService from '../services/substationService.js';

export const getSubstations = async (req, res) => {
  try {
    const { stationId } = req.query;
    const substations = await substationService.getAllSubstations(stationId);
    res.json(substations);
  } catch (error) {
    console.error('Error fetching substations:', error);
    res.status(500).json({ error: 'Failed to fetch substations' });
  }
};

export const createSubstation = async (req, res) => {
  const { name, stationId, description } = req.body;
  
  if (!name || !stationId) {
    return res.status(400).json({ error: 'Name and stationId are required' });
  }
  
  try {
    const substation = await substationService.createSubstation({ name, stationId, description });
    res.json(substation);
  } catch (error) {
    if (error.code === 'STATION_NOT_FOUND') {
      return res.status(404).json({ error: 'Station not found' });
    }
    console.error('Error creating substation:', error);
    res.status(500).json({ error: 'Failed to create substation', details: error.message });
  }
};

export const resetAllSubstations = async (req, res) => {
  try {
    console.log('🔧 Resetting all substations to active state...');
    
    const result = await substationService.resetAllSubstations();
    const { resetCount, orphanedCount, appliedCount } = result;
    
    console.log(`✅ Reset complete: ${resetCount} substation(s) set to active`);
    if (orphanedCount > 0) {
      console.log(`🧹 Cleaned ${orphanedCount} orphaned reservations`);
    }
    if (appliedCount > 0) {
      console.log(`✅ Applied ${appliedCount} deferred reservations`);
    }
    
    res.json({
      success: true,
      resetCount,
      orphanedCleaned: orphanedCount,
      appliedReservations: appliedCount,
      message: `${resetCount} alt istasyon sıfırlandı${orphanedCount > 0 ? `, ${orphanedCount} limbo temizlendi` : ''}${appliedCount > 0 ? `, ${appliedCount} rezervasyon uygulandı` : ''}`
    });
  } catch (error) {
    console.error('Error resetting substations:', error);
    res.status(500).json({ error: 'Failed to reset substations' });
  }
};

export const updateSubstation = async (req, res) => {
  const { id } = req.params;
  const { name, description, stationId, isActive } = req.body;
  
  try {
    const substation = await substationService.updateSubstation(id, { name, description, stationId, isActive });
    res.json(substation);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Substation not found' });
    }
    console.error('Error updating substation:', error);
    res.status(500).json({ error: 'Failed to update substation' });
  }
};

export const updateTechnicalStatus = async (req, res) => {
  const { id } = req.params;
  const { technicalStatus } = req.body;
  
  try {
    const substation = await substationService.updateTechnicalStatus(id, technicalStatus);
    res.json(substation);
  } catch (error) {
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: 'Invalid technical status. Must be: active, passive, or maintenance' });
    }
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Substation not found' });
    }
    console.error('Error updating technical status:', error);
    res.status(500).json({ error: 'Failed to update technical status' });
  }
};

export const getSubstationDetails = async (req, res) => {
  const { id } = req.params;
  
  try {
    console.log('[Substation Details] Fetching details for ID:', id);
    const details = await substationService.getSubstationDetails(id);
    console.log('[Substation Details] Found substation: YES');
    res.json(details);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      console.log('[Substation Details] Found substation: NO');
      return res.status(404).json({ error: 'Substation not found' });
    }
    console.error('[Substation Details] Error:', error.message);
    console.error('[Substation Details] Stack:', error.stack);
    res.status(500).json({ error: 'Failed to fetch substation details', details: error.message });
  }
};
