/**
 * Quotes Routes - PostgreSQL
 * 
 * API routes for quotes system using new relational database
 */

import Quotes from '../../../db/models/quotes.js';
import FormTemplates from '../../../db/models/formTemplates.js';
import PriceFormulas from '../../../db/models/priceFormulas.js';
import { requireAuth } from '../../../server/auth.js';
import logger from './logger.js';

/**
 * Setup quotes routes
 */
export function setupQuotesRoutes(app) {
  
  // ==================== GET STATISTICS ====================
  // IMPORTANT: This route must come before /:id to avoid matching "stats" as an ID
  app.get('/api/quotes/stats', async (req, res) => {
    try {
      logger.info('GET /api/quotes/stats - Fetching statistics');

      const filters = {
        fromDate: req.query.fromDate,
        toDate: req.query.toDate
      };

      const stats = await Quotes.getStatistics(filters);

      logger.success('Statistics fetched');
      res.json(stats);
    } catch (error) {
      logger.error('Failed to fetch statistics', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch statistics', message: error.message });
    }
  });

  // ==================== GET ALL QUOTES ====================
  app.get('/api/quotes', async (req, res) => {
    try {
      logger.info('GET /api/quotes - Fetching all quotes');
      
      const filters = {
        status: req.query.status,
        customerEmail: req.query.customerEmail,
        customerCompany: req.query.customerCompany,
        fromDate: req.query.fromDate,
        toDate: req.query.toDate
      };

      const quotes = await Quotes.getAll(filters);
      
      logger.success(`Found ${quotes.length} quotes`);
      res.json(quotes);
    } catch (error) {
      logger.error('Failed to fetch quotes', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch quotes', message: error.message });
    }
  });

  // ==================== GET SINGLE QUOTE ====================
  app.get('/api/quotes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/quotes/${id} - Fetching quote details`);
      
      const quote = await Quotes.getById(id);
      
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

  // ==================== CREATE QUOTE ====================
  app.post('/api/quotes', async (req, res) => {
    try {
      const {
        customerName,
        customerEmail,
        customerPhone,
        customerCompany,
        customerAddress,
        formTemplateId,
        priceFormulaId,
        notes,
        formData,
        delivery_date
      } = req.body;

      logger.info('POST /api/quotes - Creating new quote', {
        customer: customerName,
        company: customerCompany
      });

      // Validate required fields
      if (!customerName || !customerEmail) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          details: ['customerName and customerEmail are required'] 
        });
      }

      // Get active form template if not specified
      let templateId = formTemplateId;
      if (!templateId) {
        const activeTemplate = await FormTemplates.getActive();
        if (!activeTemplate) {
          return res.status(400).json({ 
            error: 'No active form template found',
            details: ['Please create and activate a form template first']
          });
        }
        templateId = activeTemplate.id;
      }

      // Get active price formula if not specified
      let formulaId = priceFormulaId;
      if (!formulaId) {
        const activeFormula = await PriceFormulas.getActive();
        if (activeFormula) {
          formulaId = activeFormula.id;
        }
      }

      // Parse delivery date if provided
      let deliveryDate = null;
      if (delivery_date) {
        try {
          deliveryDate = new Date(delivery_date);
          if (isNaN(deliveryDate.getTime())) {
            deliveryDate = null;
          }
        } catch (e) {
          console.warn('Invalid delivery date format:', delivery_date);
          deliveryDate = null;
        }
      }

      // Create quote
      const quote = await Quotes.create({
        customerName,
        customerEmail,
        customerPhone,
        customerCompany,
        customerAddress,
        deliveryDate,
        formTemplateId: templateId,
        priceFormulaId: formulaId,
        notes,
        formData,
        createdBy: req.user?.email || 'system'
      });

      logger.success('Quote created successfully', {
        quoteId: quote.id,
        calculatedPrice: quote.calculated_price
      });

      res.status(201).json({ success: true, quote });
    } catch (error) {
      logger.error('Failed to create quote', { error: error.message });
      res.status(500).json({ error: 'Failed to create quote', message: error.message });
    }
  });

  // ==================== UPDATE QUOTE ====================
  app.patch('/api/quotes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`PATCH /api/quotes/${id} - Updating quote`);

      // Parse delivery date if provided
      let deliveryDate = req.body.delivery_date;
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
        updatedBy: req.user?.email || 'system'
      };

      const quote = await Quotes.update(id, updates);

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

      const quote = await Quotes.updateStatus(id, status, req.user?.email || 'system');

      if (!quote) {
        logger.warning(`Quote not found: ${id}`);
        return res.status(404).json({ error: 'Quote not found' });
      }

      logger.success('Quote status updated', {
        quoteId: id,
        status: quote.status,
        approvedAt: quote.approved_at,
        approvedBy: quote.approved_by
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
      const { manualPrice, reason } = req.body;

      logger.info(`POST /api/quotes/${id}/manual-price - Setting manual price: ${manualPrice}`);

      if (!manualPrice || manualPrice <= 0) {
        return res.status(400).json({ 
          error: 'Invalid price', 
          details: ['Manual price must be greater than 0'] 
        });
      }

      const quote = await Quotes.setManualPrice(
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
        manualPrice: quote.manual_price,
        finalPrice: quote.final_price
      });

      res.json({ success: true, quote });
    } catch (error) {
      logger.error('Failed to set manual price', { error: error.message });
      res.status(500).json({ error: 'Failed to set manual price', message: error.message });
    }
  });

  // ==================== ADD FILE ====================
  app.post('/api/quotes/:id/files', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { fileType, fileName, filePath, mimeType, fileSize, description } = req.body;

      logger.info(`POST /api/quotes/${id}/files - Adding file: ${fileName}`);

      const file = await Quotes.addFile({
        quoteId: id,
        fileType,
        fileName,
        filePath,
        mimeType,
        fileSize,
        description,
        uploadedBy: req.user?.email || 'system'
      });

      logger.success('File added to quote', {
        quoteId: id,
        fileName: file.file_name
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

      const deleted = await Quotes.deleteFile(fileId);

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

      const deleted = await Quotes.delete(id);

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
