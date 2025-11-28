import * as approvedQuoteService from '../services/approvedQuoteService.js';

export const getApprovedQuotes = async (req, res) => {
  try {
    const approvedQuotes = await approvedQuoteService.getAllApprovedQuotes();
    res.json({ approvedQuotes });
  } catch (error) {
    console.error('❌ Error fetching approved quotes:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Failed to fetch approved quotes', details: error.message });
  }
};

export const ensureApprovedQuote = async (req, res) => {
  try {
    const { quoteId } = req.body || {};
    const result = await approvedQuoteService.ensureApprovedQuote(quoteId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('❌ [ENSURE] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to ensure approved quote',
      details: error.message 
    });
  }
};

export const updateProductionState = async (req, res) => {
  try {
    const { workOrderCode } = req.params;
    const { productionState } = req.body || {};
    
    const updated = await approvedQuoteService.updateProductionState(
      workOrderCode, 
      productionState, 
      req.user 
    );
    
    res.json(updated);
  } catch (error) {
    console.error('❌ Error updating production state:', error);
    res.status(500).json({ 
      error: 'Failed to update production state',
      details: error.message 
    });
  }
};
