/**
 * Lookup Controller
 * Endpoints for VAT exemptions, withholding rates, and shipment settings
 * Reference: INVOICE-EXPORT-INTEGRATION.md Section 4.1
 */

import db from '#db/connection';

// ================================
// VAT EXEMPTION CODES
// ================================

/**
 * GET /api/materials/vat-exemptions
 * Tüm aktif KDV muafiyet kodlarını listeler
 */
export async function getVatExemptions(req, res) {
  try {
    const exemptions = await db('materials.vat_exemption_codes')
      .select('id', 'code', 'name', 'description', 'isActive')
      .where('isActive', true)
      .orderBy('code', 'asc');

    res.json({
      success: true,
      data: exemptions
    });
  } catch (error) {
    console.error('Error fetching VAT exemptions:', error);
    res.status(500).json({
      success: false,
      error: 'KDV muafiyet kodları alınamadı'
    });
  }
}

// ================================
// WITHHOLDING RATES
// ================================

/**
 * GET /api/materials/withholding-rates
 * Tüm aktif tevkifat oranlarını listeler
 */
export async function getWithholdingRates(req, res) {
  try {
    const rates = await db('materials.withholding_rates')
      .select('id', 'code', 'rate', 'name', 'isActive')
      .where('isActive', true)
      .orderBy('rate', 'asc');

    // rate'i float'a çevir (PostgreSQL decimal string döndürüyor)
    const formattedRates = rates.map(r => ({
      ...r,
      rate: parseFloat(r.rate)
    }));

    res.json({
      success: true,
      data: formattedRates
    });
  } catch (error) {
    console.error('Error fetching withholding rates:', error);
    res.status(500).json({
      success: false,
      error: 'Tevkifat oranları alınamadı'
    });
  }
}

// ================================
// SHIPMENT SETTINGS
// ================================

/**
 * GET /api/materials/settings
 * Tüm shipment ayarlarını listeler
 */
export async function getSettings(req, res) {
  try {
    const settings = await db('materials.shipment_settings')
      .select('id', 'key', 'value', 'description', 'updatedAt');

    // key-value object formatına çevir
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.key] = s.value;
    });

    res.json({
      success: true,
      data: settingsMap,
      raw: settings // Detaylı bilgi için
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      error: 'Ayarlar alınamadı'
    });
  }
}

/**
 * PUT /api/materials/settings/:key
 * Belirli bir ayarı günceller
 */
export async function updateSetting(req, res) {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!value && value !== '') {
      return res.status(400).json({
        success: false,
        error: 'value alanı gerekli'
      });
    }

    // Ayarın var olup olmadığını kontrol et
    const existing = await db('materials.shipment_settings')
      .where('key', key)
      .first();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `"${key}" ayarı bulunamadı`
      });
    }

    // Güncelle
    const [updated] = await db('materials.shipment_settings')
      .where('key', key)
      .update({
        value,
        updatedAt: db.fn.now(),
        updatedBy: req.user?.id || null
      })
      .returning(['id', 'key', 'value', 'updatedAt']);

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({
      success: false,
      error: 'Ayar güncellenemedi'
    });
  }
}

/**
 * POST /api/materials/settings
 * Yeni ayar ekler (admin only)
 */
export async function createSetting(req, res) {
  try {
    const { key, value, description } = req.body;

    if (!key || !value) {
      return res.status(400).json({
        success: false,
        error: 'key ve value alanları gerekli'
      });
    }

    // Zaten var mı kontrol et
    const existing = await db('materials.shipment_settings')
      .where('key', key)
      .first();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `"${key}" ayarı zaten mevcut`
      });
    }

    const [created] = await db('materials.shipment_settings')
      .insert({
        key,
        value,
        description: description || null,
        updatedBy: req.user?.id || null
      })
      .returning(['id', 'key', 'value', 'description', 'updatedAt']);

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (error) {
    console.error('Error creating setting:', error);
    res.status(500).json({
      success: false,
      error: 'Ayar oluşturulamadı'
    });
  }
}
