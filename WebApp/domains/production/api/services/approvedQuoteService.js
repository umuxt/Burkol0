import db from '#db/connection';
import WorkOrders from '#db/models/workOrders';

export const getAllApprovedQuotes = async () => {
  const workOrders = await db('mes.work_orders as wo')
    .leftJoin('quotes.quotes as q', 'wo.quoteId', 'q.id')
    .select(
      'wo.id',
      'wo.code as workOrderCode',
      'wo.quoteId',
      'wo.status',
      'wo.productionState',
      'wo.productionStateUpdatedAt',
      'wo.productionStateUpdatedBy',
      'wo.createdAt',
      'wo.data',
      'q.customerName as customer',
      'q.customerCompany as company',
      'q.customerEmail as email',
      'q.customerPhone as phone',
      'q.finalPrice',
      'q.deliveryDate'
    )
    .orderBy('wo.createdAt', 'desc');
  
  const approvedQuotes = workOrders.map(wo => {
    let data = {};
    try {
      data = typeof wo.data === 'string' ? JSON.parse(wo.data) : (wo.data || {});
    } catch (e) {
      console.error(`Failed to parse data for WO ${wo.workOrderCode}:`, e);
    }
    
    let deliveryDate = data.deliveryDate || wo.deliveryDate;
    if (deliveryDate && !(deliveryDate instanceof Date)) {
      try {
        deliveryDate = new Date(deliveryDate).toISOString();
      } catch (e) {
        deliveryDate = null;
      }
    } else if (deliveryDate instanceof Date) {
      deliveryDate = deliveryDate.toISOString();
    }
    
    return {
      id: wo.id,
      workOrderCode: wo.workOrderCode,
      quoteId: wo.quoteId,
      status: wo.status,
      productionState: wo.productionState,
      productionStateUpdatedAt: wo.productionStateUpdatedAt,
      productionStateUpdatedBy: wo.productionStateUpdatedBy,
      createdAt: wo.createdAt,
      customer: wo.customer,
      company: wo.company,
      email: wo.email,
      phone: wo.phone,
      price: data.price || wo.finalPrice,
      deliveryDate,
      formData: data.formData,
      quoteSnapshot: data.quoteSnapshot
    };
  });
  
  console.log(`✅ Fetched ${approvedQuotes.length} work orders from mes.work_orders`);
  return approvedQuotes;
};

export const ensureApprovedQuote = async (quoteId) => {
  console.log(`🔍 [ENSURE] Starting WO creation for quote: ${quoteId}`);
  
  if (!quoteId) {
    console.log('❌ [ENSURE] No quoteId provided');
    return { success: false, error: 'quoteId_required' };
  }

  const existingQuote = await db('quotes.quotes')
    .where('id', quoteId)
    .first('workOrderCode', 'status');
  
  if (!existingQuote) {
    console.log(`❌ [ENSURE] Quote not found in PostgreSQL: ${quoteId}`);
    return { success: false, error: 'quote_not_found' };
  }

  if (existingQuote.workOrderCode) {
    console.log(`ℹ️ [ENSURE] WO already exists: ${existingQuote.workOrderCode}`);
    return { 
      success: true, 
      ensured: true, 
      workOrderCode: existingQuote.workOrderCode 
    };
  }

  const st = String(existingQuote.status || '').toLowerCase();
  if (!(st === 'approved' || st === 'onaylandı' || st === 'onaylandi')) {
    console.log(`❌ [ENSURE] Quote not approved. Status: ${existingQuote.status}`);
    return { 
      success: false, 
      error: 'quote_not_approved', 
      status: existingQuote.status || null 
    };
  }

  console.log(`⚠️ [ENSURE] Quote is approved but no WO found - may have failed during approval`);
  return { 
    success: false, 
    error: 'wo_creation_failed',
    message: 'Work order should have been created during quote approval'
  };
};

/**
 * Get work order details with full quote and customer data
 * Uses the new simplified data model - fetches related data on demand
 * Note: Only returns production-relevant customer info (not finance/billing)
 */
export const getWorkOrderDetails = async (workOrderCode) => {
  if (!workOrderCode) {
    throw new Error('workOrderCode_required');
  }

  // Use the model method that handles joins
  const details = await WorkOrders.getWithQuoteAndCustomer(workOrderCode);
  
  if (!details) {
    return null;
  }

  const { workOrder, quote, customer } = details;

  // Format delivery date
  let deliveryDate = quote?.deliveryDate;
  if (deliveryDate && !(deliveryDate instanceof Date)) {
    try {
      deliveryDate = new Date(deliveryDate).toISOString();
    } catch (e) {
      deliveryDate = null;
    }
  } else if (deliveryDate instanceof Date) {
    deliveryDate = deliveryDate.toISOString();
  }

  // Get form field labels from active template
  let formDataWithLabels = {};
  if (quote?.formData && Object.keys(quote.formData).length > 0) {
    try {
      // Fetch form fields to get labels
      const formFields = await db('quotes.form_fields as ff')
        .join('quotes.form_templates as ft', 'ff.templateId', 'ft.id')
        .where('ft.isActive', true)
        .select('ff.fieldCode', 'ff.fieldName');
      
      // Create a map of fieldCode -> fieldName
      const fieldLabelMap = {};
      formFields.forEach(f => {
        fieldLabelMap[f.fieldCode] = f.fieldName;
      });

      // Transform formData to use labels instead of codes
      Object.entries(quote.formData).forEach(([code, value]) => {
        const label = fieldLabelMap[code] || code;
        formDataWithLabels[label] = value;
      });
    } catch (e) {
      console.error('Failed to fetch form field labels:', e);
      formDataWithLabels = quote.formData;
    }
  }

  return {
    workOrder: {
      id: workOrder.id,
      code: workOrder.code,
      quoteId: workOrder.quoteId,
      status: workOrder.status,
      productionState: workOrder.productionState,
      productionLaunched: workOrder.productionLaunched,
      productionLaunchedAt: workOrder.productionLaunchedAt,
      productionStateUpdatedAt: workOrder.productionStateUpdatedAt,
      productionStateUpdatedBy: workOrder.productionStateUpdatedBy,
      createdAt: workOrder.createdAt
    },
    quote: quote ? {
      id: quote.id,
      status: quote.status,
      customerId: quote.customerId,
      customerName: quote.customerName,
      customerCompany: quote.customerCompany,
      deliveryDate,
      finalPrice: quote.finalPrice,
      calculatedPrice: quote.calculatedPrice,
      formData: quote.formData,
      notes: quote.notes,
      createdAt: quote.createdAt
    } : null,
    // Customer info: Only production-relevant fields (no finance/billing info)
    customer: customer ? {
      id: customer.id,
      name: customer.name,
      company: customer.company,
      contactPerson: customer.contactPerson,
      contactTitle: customer.contactTitle,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      city: customer.city,
      country: customer.country
      // Excluded: taxNumber, taxOffice, iban, bankName, fax, website, postalCode
    } : null,
    // Backward compatibility fields
    customerName: customer?.name || quote?.customerName,
    company: customer?.company || quote?.customerCompany,
    phone: customer?.phone || quote?.customerPhone,
    price: quote?.finalPrice || quote?.calculatedPrice,
    deliveryDate,
    formData: formDataWithLabels
  };
};

export const updateProductionState = async (workOrderCode, productionState, user) => {
  if (!workOrderCode) {
    throw new Error('workOrderCode_required');
  }
  
  if (!productionState) {
    throw new Error('productionState_required');
  }
  
  const validStates = [
    'Üretim Onayı Bekliyor',
    'Üretiliyor',
    'Üretim Durduruldu', 
    'Üretim Tamamlandı',
    'İptal Edildi'
  ];
  
  if (!validStates.includes(productionState)) {
    throw new Error('invalid_production_state');
  }
  
  const workOrder = await WorkOrders.getByCode(workOrderCode);
  
  if (!workOrder) {
    throw new Error(`${workOrderCode} için iş emri bulunamadı. Quotes ekranından bu work order'ı oluşturup tekrar deneyin.`);
  }
  
  const updatedBy = user?.email || 'system';
  const updated = await WorkOrders.updateProductionState(
    workOrderCode, 
    productionState, 
    updatedBy,
    '' 
  );
  
  console.log(`✅ Production state updated: ${workOrderCode} → ${productionState}`);
  
  return {
    success: true,
    workOrderCode,
    productionState,
    updatedAt: new Date().toISOString()
  };
};
