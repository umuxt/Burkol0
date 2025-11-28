import db from '#db/connection';

export const getAllWorkOrders = async () => {
  return await db('mes.work_orders')
    .select(
      'id',
      'code',
      'quoteId',
      'status',
      'data',
      'createdAt',
      'updatedAt'
    )
    .orderBy('createdAt', 'desc');
};

export const createWorkOrder = async (workOrderData) => {
  const { quoteId, status, data } = workOrderData;

  // Generate WO code (WO-001, WO-002, WO-003...)
  const [{ maxCode }] = await db('mes.work_orders')
    .max('code as maxCode');
  
  let nextNum = 1;
  if (maxCode) {
    const match = maxCode.match(/WO-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }
  
  const code = `WO-${nextNum.toString().padStart(3, '0')}`;
  
  // Create work order (production work order, not materials.orders!)
  const [workOrder] = await db('mes.work_orders')
    .insert({
      id: code,  // Use code as ID
      code,
      quoteId,
      status: status || 'pending',
      data: data ? JSON.stringify(data) : null,
      createdAt: db.fn.now(),
      updatedAt: db.fn.now()
    })
    .returning(['id', 'code', 'quoteId', 'status', 'data', 'createdAt', 'updatedAt']);
  
  return workOrder;
};

export const updateWorkOrder = async (id, workOrderData) => {
  const { quoteId, status, data } = workOrderData;

  const updateData = {
    updatedAt: db.fn.now()
  };
  
  // Only update provided fields
  if (quoteId !== undefined) updateData.quoteId = quoteId;
  if (status !== undefined) updateData.status = status;
  if (data !== undefined) updateData.data = JSON.stringify(data);
  
  const [workOrder] = await db('mes.work_orders')
    .where({ id })
    .update(updateData)
    .returning(['id', 'code', 'quoteId', 'status', 'data', 'updatedAt']);
  
  return workOrder;
};

export const deleteWorkOrder = async (id) => {
  const [deleted] = await db('mes.work_orders')
    .where({ id })
    .delete()
    .returning('id');
  
  return deleted;
};

export const getNextWorkOrderCode = async () => {
  const [{ maxCode }] = await db('mes.work_orders')
    .max('code as maxCode');
  
  let nextNum = 1;
  if (maxCode) {
    const match = maxCode.match(/WO-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }
  
  return `WO-${nextNum.toString().padStart(3, '0')}`;
};
