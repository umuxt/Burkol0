/**
 * Quote Controller
 * 
 * API routes for quote management
 * Updated for B0: Uses PriceSettings instead of PriceFormulas
 */

import * as quoteService from '../services/quoteService.js';
import { requireAuth } from '../../../../server/auth.js';
import logger from '../../utils/logger.js';
import Quotes from '../../../../db/models/quotes.js';
import PriceSettings from '../services/priceSettingsService.js';
import customerService from '../services/customerService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '../../../../uploads/quotes');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Setup quotes routes
 */
export function setupQuotesRoutes(app) {
  
  // ==================== GET STATISTICS ====================
  // IMPORTANT: This route must come before /:id to avoid matching "stats" as an ID
  app.get('/api/quotes/stats', requireAuth, async (req, res) => {
    try {
      logger.info('GET /api/quotes/stats - Fetching statistics');

      const filters = {
        fromDate: req.query.fromDate,
        toDate: req.query.toDate
      };

      const stats = await quoteService.getQuoteStatistics(filters);

      logger.success('Statistics fetched');
      res.json(stats);
    } catch (error) {
      logger.error('Failed to fetch statistics', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch statistics', message: error.message });
    }
  });

  // ==================== GET ALL QUOTES ====================
  app.get('/api/quotes', requireAuth, async (req, res) => {
    try {
      logger.info('GET /api/quotes - Fetching all quotes');
      
      const filters = {
        status: req.query.status,
        customerEmail: req.query.customerEmail,
        customerCompany: req.query.customerCompany,
        fromDate: req.query.fromDate,
        toDate: req.query.toDate
      };

      const quotes = await quoteService.getQuotes(filters);
      
      logger.success(`Found ${quotes.length} quotes`);
      res.json(quotes);
    } catch (error) {
      logger.error('Failed to fetch quotes', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch quotes', message: error.message });
    }
  });

  // ==================== GET SINGLE QUOTE ====================
  app.get('/api/quotes/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/quotes/${id} - Fetching quote details`);
      
      const quote = await quoteService.getQuoteById(id);
      
      if (!quote) {
        logger.warning(`Quote not found: ${id}`);
        return res.status(404).json({ error: 'Quote not found' });
      }

      logger.success(`Quote fetched: ${id}`);
      res.json(quote);
    } catch (error) {
      logger.error('Failed to fetch quote', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch quote', message: error.message });
    }
  });

  // ==================== GET QUOTE EDIT STATUS ====================
  app.get('/api/quotes/:id/edit-status', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/quotes/${id}/edit-status - Checking edit status`);
      
      const editStatus = await Quotes.getEditStatus(id);
      
      if (!editStatus) {
        logger.warning(`Quote not found: ${id}`);
        return res.status(404).json({ error: 'Quote not found' });
      }

      logger.success(`Edit status fetched: ${id}`, { 
        canEdit: editStatus.canEdit,
        hasWorkOrder: editStatus.hasWorkOrder
      });
      res.json(editStatus);
    } catch (error) {
      logger.error('Failed to fetch edit status', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch edit status', message: error.message });
    }
  });

  // ==================== GET QUOTE PRICE COMPARISON ====================
  app.get('/api/quotes/:id/price-comparison', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/quotes/${id}/price-comparison - Getting price comparison`);
      
      const quote = await Quotes.getById(id);
      
      if (!quote) {
        logger.warning(`Quote not found: ${id}`);
        return res.status(404).json({ error: 'Quote not found' });
      }

      // Get current setting for comparison (B0: priceSettingId replaces priceFormulaId)
      const currentSetting = quote.priceSettingId 
        ? await PriceSettings.getById(quote.priceSettingId)
        : null;
      
      // Get active price settings to compare versions
      const activeSetting = await PriceSettings.getActive();

      const quoteSettingVersion = quote.priceSettingCode || currentSetting?.version || 1;
      const latestSettingVersion = activeSetting?.version || currentSetting?.version || 1;
      
      // Calculate if update needed
      const versionMismatch = quoteSettingVersion !== latestSettingVersion;
      const settingIdMismatch = quote.priceSettingId !== activeSetting?.id;
      const needsUpdate = versionMismatch || settingIdMismatch;

      // Build versions object
      const versions = {
        original: {
          version: quote.priceSettingCode || 'N/A',
          versionId: quote.priceSettingId || null,
          timestamp: quote.createdAt
        },
        applied: {
          version: currentSetting?.version || quote.priceSettingCode || 'N/A',
          versionId: quote.priceSettingId || null,
          timestamp: quote.lastCalculatedAt || quote.updatedAt
        },
        latest: {
          version: activeSetting?.version || 'N/A',
          versionId: activeSetting?.id || null,
          timestamp: activeSetting?.updatedAt || new Date().toISOString()
        }
      };

      // Build difference summary
      const differenceSummary = {
        priceDiff: 0, // Would need recalculation to determine actual diff
        oldPrice: quote.finalPrice || quote.calculatedPrice || 0,
        newPrice: quote.finalPrice || quote.calculatedPrice || 0, // Same until recalculated
        reasons: [],
        parameterChanges: { added: [], removed: [], modified: [] },
        formulaChanged: settingIdMismatch || versionMismatch,
        comparisonBaseline: 'applied'
      };

      if (versionMismatch) {
        differenceSummary.reasons.push(`Fiyat ayarı güncellendi: v${quoteSettingVersion} → v${latestSettingVersion}`);
      }

      logger.success(`Price comparison fetched: ${id}`, { needsUpdate, versionMismatch });
      
      res.json({
        quote: {
          id: quote.id,
          appliedPrice: quote.finalPrice || quote.calculatedPrice || 0,
          latestPrice: quote.finalPrice || quote.calculatedPrice || 0
        },
        needsUpdate,
        versions,
        differenceSummary,
        comparisonBaseline: 'applied'
      });
    } catch (error) {
      logger.error('Failed to get price comparison', { error: error.message });
      res.status(500).json({ error: 'Failed to get price comparison', message: error.message });
    }
  });

  // ==================== CREATE QUOTE ====================
  app.post('/api/quotes', requireAuth, async (req, res) => {
    try {
      const {
        // Customer type for new flow: 'existing', 'new', 'without'
        customerType,
        // Existing customer ID (for customerType='existing')
        customerId,
        // New customer data (for customerType='new')
        newCustomerData,
        // Customer fields for backward compatibility
        customerName,
        customerEmail,
        customerPhone,
        customerCompany,
        customerAddress,
        formTemplateId,
        priceFormulaId,
        notes,
        formData,
        deliveryDate,
        // FILES - yeni eklendi
        files,
        productImages
      } = req.body;

      logger.info('POST /api/quotes - Creating new quote', {
        customerType: customerType || 'legacy',
        customer: customerName,
        company: customerCompany
      });

      let resolvedCustomerId = customerId;
      let resolvedCustomerName = customerName;
      let resolvedCustomerEmail = customerEmail;
      let resolvedCustomerPhone = customerPhone;
      let resolvedCustomerCompany = customerCompany;
      let resolvedCustomerAddress = customerAddress;
      let isCustomer = false;

      // Handle customer type based on new flow
      if (customerType === 'existing' && customerId) {
        // Using existing customer - fetch their data
        const customer = await customerService.getCustomerById(customerId);
        if (!customer) {
          return res.status(400).json({
            error: 'Customer not found',
            details: ['Selected customer does not exist']
          });
        }
        resolvedCustomerName = customer.name;
        resolvedCustomerEmail = customer.email || '';
        resolvedCustomerPhone = customer.phone || '';
        resolvedCustomerCompany = customer.company || '';
        resolvedCustomerAddress = customer.address || '';
        isCustomer = true;
        logger.info('Using existing customer', { customerId, customerName: customer.name });

      } else if (customerType === 'new' && newCustomerData) {
        // Creating new customer first
        if (!newCustomerData.name) {
          return res.status(400).json({
            error: 'Missing required field',
            details: ['Customer name is required for new customer']
          });
        }
        const newCustomer = await customerService.createCustomer(newCustomerData);
        resolvedCustomerId = newCustomer.id;
        resolvedCustomerName = newCustomer.name;
        resolvedCustomerEmail = newCustomer.email || '';
        resolvedCustomerPhone = newCustomer.phone || '';
        resolvedCustomerCompany = newCustomer.company || '';
        resolvedCustomerAddress = newCustomer.address || '';
        isCustomer = true;
        logger.info('Created new customer', { customerId: newCustomer.id, customerName: newCustomer.name });

      } else if (customerType === 'without') {
        // Quote without customer record
        resolvedCustomerId = null;
        isCustomer = false;
        logger.info('Creating quote without customer record');

      } else {
        // Legacy flow - validate required fields
        if (!customerName || !customerEmail) {
          return res.status(400).json({ 
            error: 'Missing required fields', 
            details: ['customerName and customerEmail are required'] 
          });
        }
      }

      // Get active form template if not specified
      let templateId = formTemplateId;
      if (!templateId) {
        const activeTemplate = await quoteService.getActiveFormTemplate();
        if (!activeTemplate) {
          return res.status(400).json({ 
            error: 'No active form template found',
            details: ['Please create and activate a form template first']
          });
        }
        templateId = activeTemplate.id;
      }

      // Get active price setting if not specified (B0: uses priceSettingId)
      let settingId = req.body.priceSettingId || req.body.priceFormulaId; // backward compatible
      if (!settingId) {
        const activeSetting = await quoteService.getActivePriceSetting();
        if (activeSetting) {
          settingId = activeSetting.id;
        }
      }

      // Parse delivery date if provided
      let parsedDeliveryDate = null;
      if (deliveryDate) {
        try {
          parsedDeliveryDate = new Date(deliveryDate);
          if (isNaN(parsedDeliveryDate.getTime())) {
            parsedDeliveryDate = null;
          }
        } catch (e) {
          console.warn('Invalid delivery date format:', deliveryDate);
          parsedDeliveryDate = null;
        }
      }

      // Create quote
      const quote = await quoteService.createQuote({
        customerName: resolvedCustomerName,
        customerEmail: resolvedCustomerEmail,
        customerPhone: resolvedCustomerPhone,
        customerCompany: resolvedCustomerCompany,
        customerAddress: resolvedCustomerAddress,
        deliveryDate: parsedDeliveryDate,
        formTemplateId: templateId,
        priceSettingId: settingId,
        notes,
        formData,
        isCustomer,
        customerId: resolvedCustomerId,
        createdBy: req.user?.email || 'system'
      });

      // DOSYALARI KAYDET - Quote oluşturulduktan sonra
      const uploadedBy = req.user?.email || 'system';
      
      // Teknik dosyalar
      if (files && Array.isArray(files) && files.length > 0) {
        for (const file of files) {
          try {
            await quoteService.addFile({
              quoteId: quote.id,
              fileType: 'technical',
              fileName: file.name || file.fileName,
              filePath: file.url || file.filePath, // data URL veya path
              mimeType: file.type || file.mimeType,
              fileSize: file.size || file.fileSize,
              description: file.description || null,
              uploadedBy
            });
          } catch (fileError) {
            logger.warning(`Failed to save technical file: ${file.name}`, { error: fileError.message });
          }
        }
        logger.info(`Saved ${files.length} technical files for quote ${quote.id}`);
      }
      
      // Ürün görselleri
      if (productImages && Array.isArray(productImages) && productImages.length > 0) {
        for (const img of productImages) {
          try {
            await quoteService.addFile({
              quoteId: quote.id,
              fileType: 'product',
              fileName: img.name || img.fileName,
              filePath: img.url || img.filePath, // data URL veya path
              mimeType: img.type || img.mimeType,
              fileSize: img.size || img.fileSize,
              description: img.description || null,
              uploadedBy
            });
          } catch (fileError) {
            logger.warning(`Failed to save product image: ${img.name}`, { error: fileError.message });
          }
        }
        logger.info(`Saved ${productImages.length} product images for quote ${quote.id}`);
      }

      logger.success('Quote created successfully', {
        quoteId: quote.id,
        customerId: resolvedCustomerId,
        customerType: customerType || 'legacy',
        calculatedPrice: quote.calculatedPrice,
        filesCount: (files?.length || 0) + (productImages?.length || 0)
      });

      // Quote'u dosyalarla birlikte yeniden getir
      const fullQuote = await quoteService.getQuoteById(quote.id);

      res.status(201).json({ success: true, quote: fullQuote });
    } catch (error) {
      logger.error('Failed to create quote', { error: error.message });
      res.status(500).json({ error: 'Failed to create quote', message: error.message });
    }
  });

  // ==================== UPDATE QUOTE ====================
  app.patch('/api/quotes/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`PATCH /api/quotes/${id} - Updating quote`);

      // Check if quote can be edited (edit lock)
      const canEdit = await Quotes.canEdit(id);
      if (!canEdit) {
        logger.warning(`Quote ${id} is locked - production has started`);
        return res.status(403).json({ 
          error: 'Quote is locked',
          details: ['This quote cannot be edited because production has already started']
        });
      }

      // Parse delivery date if provided
      let deliveryDate = req.body.deliveryDate;
      if (deliveryDate) {
        try {
          const parsedDate = new Date(deliveryDate);
          deliveryDate = isNaN(parsedDate.getTime()) ? null : parsedDate;
        } catch (e) {
          console.warn('Invalid delivery date format:', deliveryDate);
          deliveryDate = null;
        }
      }

      const updates = {
        customerName: req.body.customerName,
        customerEmail: req.body.customerEmail,
        customerPhone: req.body.customerPhone,
        customerCompany: req.body.customerCompany,
        customerAddress: req.body.customerAddress,
        deliveryDate,
        notes: req.body.notes,
        formData: req.body.formData,
        isCustomer: req.body.isCustomer,
        customerId: req.body.customerId,
        updatedBy: req.user?.email || 'system'
      };

      const quote = await quoteService.updateQuote(id, updates);

      if (!quote) {
        logger.warning(`Quote not found: ${id}`);
        return res.status(404).json({ error: 'Quote not found' });
      }

      logger.success('Quote updated successfully', { quoteId: id });
      res.json({ success: true, quote });
    } catch (error) {
      logger.error('Failed to update quote', { error: error.message });
      res.status(500).json({ error: 'Failed to update quote', message: error.message });
    }
  });

  // ==================== UPDATE QUOTE STATUS ====================
  app.patch('/api/quotes/:id/status', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      logger.info(`PATCH /api/quotes/${id}/status - Updating status to: ${status}`);

      // Validate status
      const validStatuses = ['new', 'pending', 'approved', 'rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: 'Invalid status', 
          details: [`Status must be one of: ${validStatuses.join(', ')}`] 
        });
      }

      const quote = await quoteService.updateQuoteStatus(id, status, req.user?.email || 'system');

      if (!quote) {
        logger.warning(`Quote not found: ${id}`);
        return res.status(404).json({ error: 'Quote not found' });
      }

      logger.success('Quote status updated', {
        quoteId: id,
        status: quote.status,
        approvedAt: quote.approvedAt,
        approvedBy: quote.approvedBy
      });

      res.json({ success: true, quote });
    } catch (error) {
      logger.error('Failed to update quote status', { error: error.message });
      res.status(500).json({ error: 'Failed to update status', message: error.message });
    }
  });

  // ==================== SET MANUAL PRICE ====================
  app.post('/api/quotes/:id/manual-price', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      // Support both { price, note } and { manualPrice, reason } formats
      const manualPrice = req.body.price ?? req.body.manualPrice;
      const reason = req.body.note ?? req.body.reason;

      logger.info(`POST /api/quotes/${id}/manual-price - Setting manual price: ${manualPrice}`);

      if (!manualPrice || manualPrice <= 0) {
        return res.status(400).json({ 
          error: 'Invalid price', 
          details: ['Manual price must be greater than 0'] 
        });
      }

      const quote = await quoteService.setManualPrice(
        id, 
        parseFloat(manualPrice), 
        reason || 'Manuel fiyat belirlendi',
        req.user?.email || 'system'
      );

      if (!quote) {
        logger.warning(`Quote not found: ${id}`);
        return res.status(404).json({ error: 'Quote not found' });
      }

      logger.success('Manual price set', {
        quoteId: id,
        manualPrice: quote.manualPrice,
        finalPrice: quote.finalPrice
      });

      // Return manualOverride object for frontend compatibility
      res.json({ 
        success: true, 
        quote,
        manualOverride: {
          active: true,
          price: quote.manualPrice,
          note: reason || 'Manuel fiyat belirlendi',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to set manual price', { error: error.message });
      res.status(500).json({ error: 'Failed to set manual price', message: error.message });
    }
  });

  // ==================== CLEAR MANUAL PRICE ====================
  app.delete('/api/quotes/:id/manual-price', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body || {};

      logger.info(`DELETE /api/quotes/${id}/manual-price - Clearing manual price`);

      const quote = await quoteService.clearManualPrice(
        id, 
        reason || 'Manuel fiyat kaldırıldı',
        req.user?.email || 'system'
      );

      if (!quote) {
        logger.warning(`Quote not found: ${id}`);
        return res.status(404).json({ error: 'Quote not found' });
      }

      logger.success('Manual price cleared', { quoteId: id });

      res.json({ 
        success: true, 
        quote,
        manualOverride: null
      });
    } catch (error) {
      logger.error('Failed to clear manual price', { error: error.message });
      res.status(500).json({ error: 'Failed to clear manual price', message: error.message });
    }
  });

  // ==================== ADD FILE ====================
  app.post('/api/quotes/:id/files', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { fileType, fileName, filePath: dataUrl, mimeType, fileSize, description } = req.body;

      logger.info(`POST /api/quotes/${id}/files - Adding file: ${fileName}`);

      // Data URL'den dosyayı disk'e kaydet
      let savedFilePath = dataUrl;
      
      if (dataUrl && dataUrl.startsWith('data:')) {
        // Base64 data URL'i çöz
        const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Benzersiz dosya adı oluştur
          const uniqueId = crypto.randomBytes(8).toString('hex');
          const ext = path.extname(fileName) || '';
          const safeFileName = `${id}_${uniqueId}${ext}`;
          const fullPath = path.join(UPLOADS_DIR, safeFileName);
          
          // Dosyayı kaydet
          fs.writeFileSync(fullPath, buffer);
          
          // DB'ye kaydedilecek relative path
          savedFilePath = `/uploads/quotes/${safeFileName}`;
          
          logger.info(`File saved to disk: ${savedFilePath}`);
        }
      }

      const file = await quoteService.addFile({
        quoteId: id,
        fileType,
        fileName,
        filePath: savedFilePath,
        mimeType,
        fileSize,
        description,
        uploadedBy: req.user?.email || 'system'
      });

      logger.success('File added to quote', {
        quoteId: id,
        fileName: file.fileName
      });

      res.status(201).json({ success: true, file });
    } catch (error) {
      logger.error('Failed to add file', { error: error.message });
      res.status(500).json({ error: 'Failed to add file', message: error.message });
    }
  });

  // ==================== DELETE FILE ====================
  app.delete('/api/quotes/:id/files/:fileId', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;

      logger.info(`DELETE /api/quotes/:id/files/${fileId} - Deleting file`);

      const deleted = await quoteService.deleteFile(fileId);

      if (!deleted) {
        logger.warning(`File not found: ${fileId}`);
        return res.status(404).json({ error: 'File not found' });
      }

      logger.success('File deleted', { fileId });
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete file', { error: error.message });
      res.status(500).json({ error: 'Failed to delete file', message: error.message });
    }
  });

  // ==================== DELETE QUOTE ====================
  app.delete('/api/quotes/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      logger.info(`DELETE /api/quotes/${id} - Deleting quote`);

      const deleted = await quoteService.deleteQuote(id);

      if (!deleted) {
        logger.warning(`Quote not found: ${id}`);
        return res.status(404).json({ error: 'Quote not found' });
      }

      logger.success('Quote deleted', { quoteId: id });
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete quote', { error: error.message });
      res.status(500).json({ error: 'Failed to delete quote', message: error.message });
    }
  });
}

export default setupQuotesRoutes;
