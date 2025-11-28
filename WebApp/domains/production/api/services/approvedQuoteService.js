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
