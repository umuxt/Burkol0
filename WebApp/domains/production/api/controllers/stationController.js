import * as stationService from '../services/stationService.js';

export const getStations = async (req, res) => {
  try {
    const stations = await stationService.getAllStations();
    res.json(stations);
  } catch (error) {
    console.error('Error fetching stations:', error);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
};

export const saveStations = async (req, res) => {
  const { stations } = req.body;
  
  if (!Array.isArray(stations) || stations.length === 0) {
    return res.status(400).json({ error: 'Invalid stations array' });
  }

  try {
    const results = await stationService.saveStations(stations);
    res.json(results);
  } catch (error) {
    console.error('Error saving stations:', error);
    res.status(500).json({ error: 'Failed to save stations' });
  }
};

export const getStationWorkers = async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await stationService.getStationWorkers(id);
    if (!result) return res.status(404).json({ error: 'Station not found' });
    res.json(result);
  } catch (error) {
    console.error('Error fetching station workers:', error);
    res.status(500).json({ error: 'Failed to fetch station workers' });
  }
};

export const deleteStation = async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await stationService.deleteStation(id);
    if (!result) return res.status(404).json({ error: 'Station not found' });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error deleting station:', error);
    res.status(500).json({ error: 'Failed to delete station' });
  }
};
