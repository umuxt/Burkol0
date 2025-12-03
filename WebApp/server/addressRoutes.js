/**
 * Address Data API Routes
 * Türkiye adres verilerine erişim için API endpoint'leri
 */

import express from 'express';
import db from '../db/connection.js';

const router = express.Router();

// GET /api/address/countries - Ülke listesi
router.get('/countries', async (req, res) => {
  try {
    const result = await db.raw(`
      SELECT id, name, phone_code 
      FROM address_data.countries 
      WHERE is_active = true
      ORDER BY sort_order, name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching countries:', err);
    res.status(500).json({ error: 'Ülke listesi alınamadı' });
  }
});

// GET /api/address/cities - Şehir listesi (Türkiye için)
router.get('/cities', async (req, res) => {
  try {
    const countryId = req.query.countryId || 1; // Default: Türkiye (id=1)
    const result = await db.raw(`
      SELECT id, name 
      FROM address_data.cities 
      WHERE country_id = ?
      ORDER BY name
    `, [countryId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching cities:', err);
    res.status(500).json({ error: 'Şehir listesi alınamadı' });
  }
});

// GET /api/address/counties/:cityId - İlçe listesi
router.get('/counties/:cityId', async (req, res) => {
  try {
    const { cityId } = req.params;
    const result = await db.raw(`
      SELECT id, name 
      FROM address_data.counties 
      WHERE city_id = ?
      ORDER BY name
    `, [cityId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching counties:', err);
    res.status(500).json({ error: 'İlçe listesi alınamadı' });
  }
});

// GET /api/address/districts/:countyId - Semt listesi
router.get('/districts/:countyId', async (req, res) => {
  try {
    const { countyId } = req.params;
    const result = await db.raw(`
      SELECT id, name 
      FROM address_data.districts 
      WHERE county_id = ?
      ORDER BY name
    `, [countyId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching districts:', err);
    res.status(500).json({ error: 'Semt listesi alınamadı' });
  }
});

// GET /api/address/neighbourhoods-by-county/:countyId - İlçeye göre mahalle listesi (Türkiye için)
router.get('/neighbourhoods-by-county/:countyId', async (req, res) => {
  try {
    const { countyId } = req.params;
    const result = await db.raw(`
      SELECT n.id, n.name, n.post_code 
      FROM address_data.neighbourhoods n
      JOIN address_data.districts d ON n.district_id = d.id
      WHERE d.county_id = ?
      ORDER BY n.name
    `, [countyId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching neighbourhoods by county:', err);
    res.status(500).json({ error: 'Mahalle listesi alınamadı' });
  }
});

// GET /api/address/neighbourhoods/:districtId - Mahalle listesi (semte göre)
router.get('/neighbourhoods/:districtId', async (req, res) => {
  try {
    const { districtId } = req.params;
    const result = await db.raw(`
      SELECT id, name, post_code 
      FROM address_data.neighbourhoods 
      WHERE district_id = ?
      ORDER BY name
    `, [districtId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching neighbourhoods:', err);
    res.status(500).json({ error: 'Mahalle listesi alınamadı' });
  }
});

// GET /api/address/search - Posta koduna göre arama
router.get('/search', async (req, res) => {
  try {
    const { postCode, query } = req.query;
    
    if (postCode) {
      // Posta koduna göre ara
      const result = await db.raw(`
        SELECT 
          n.id as neighbourhood_id,
          n.name as neighbourhood,
          n.post_code,
          d.id as district_id,
          d.name as district,
          c.id as county_id,
          c.name as county,
          ci.id as city_id,
          ci.name as city
        FROM address_data.neighbourhoods n
        JOIN address_data.districts d ON n.district_id = d.id
        JOIN address_data.counties c ON d.county_id = c.id
        JOIN address_data.cities ci ON c.city_id = ci.id
        WHERE n.post_code = ?
        LIMIT 50
      `, [postCode]);
      return res.json(result.rows);
    }
    
    if (query && query.length >= 2) {
      // Metin araması (mahalle/semt/ilçe adı)
      const searchTerm = `%${query}%`;
      const result = await db.raw(`
        SELECT 
          n.id as neighbourhood_id,
          n.name as neighbourhood,
          n.post_code,
          d.name as district,
          c.name as county,
          ci.name as city
        FROM address_data.neighbourhoods n
        JOIN address_data.districts d ON n.district_id = d.id
        JOIN address_data.counties c ON d.county_id = c.id
        JOIN address_data.cities ci ON c.city_id = ci.id
        WHERE n.name ILIKE ? OR d.name ILIKE ? OR c.name ILIKE ?
        ORDER BY ci.name, c.name, d.name, n.name
        LIMIT 50
      `, [searchTerm, searchTerm, searchTerm]);
      return res.json(result.rows);
    }
    
    res.json([]);
  } catch (err) {
    console.error('Error searching address:', err);
    res.status(500).json({ error: 'Adres araması başarısız' });
  }
});

// GET /api/address/full/:neighbourhoodId - Tam adres bilgisi
router.get('/full/:neighbourhoodId', async (req, res) => {
  try {
    const { neighbourhoodId } = req.params;
    const result = await db.raw(`
      SELECT 
        n.id as neighbourhood_id,
        n.name as neighbourhood,
        n.post_code,
        d.id as district_id,
        d.name as district,
        c.id as county_id,
        c.name as county,
        ci.id as city_id,
        ci.name as city,
        co.id as country_id,
        co.name as country
      FROM address_data.neighbourhoods n
      JOIN address_data.districts d ON n.district_id = d.id
      JOIN address_data.counties c ON d.county_id = c.id
      JOIN address_data.cities ci ON c.city_id = ci.id
      JOIN address_data.countries co ON ci.country_id = co.id
      WHERE n.id = ?
    `, [neighbourhoodId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Adres bulunamadı' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching full address:', err);
    res.status(500).json({ error: 'Adres bilgisi alınamadı' });
  }
});

export default router;
