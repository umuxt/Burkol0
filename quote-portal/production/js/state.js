// App state and persistence (extracted from production.html)

export let currentView = 'dashboard';
export function setCurrentView(view) { currentView = view; }

export const MESData = {
  workOrders: [
    { id: 'WO-001', product: 'Metal Bracket Type A', quantity: 100, progress: 75, status: 'in-progress', dueDate: '2025-10-29', priority: 'high' },
    { id: 'WO-002', product: 'Steel Frame Assembly', quantity: 50, progress: 45, status: 'on-hold', dueDate: '2025-11-02', priority: 'normal' },
    { id: 'WO-003', product: 'Custom Welding Job', quantity: 25, progress: 100, status: 'completed', dueDate: '2025-10-28', priority: 'high' },
    { id: 'WO-004', product: 'Aluminum Sheet Cutting', quantity: 200, progress: 20, status: 'planned', dueDate: '2025-11-05', priority: 'low' }
  ],
  workers: [
    { id: 'w-001', name: 'Ali Kaya', email: 'ali@burkol.com', skills: ['Welding', 'Cutting'], shift: 'Day', status: 'active', currentTask: 'WO-001', station: 'Station A' },
    { id: 'w-002', name: 'Mehmet Yılmaz', email: 'mehmet@burkol.com', skills: ['Assembly', 'Quality Control'], shift: 'Day', status: 'active', currentTask: 'WO-002', station: 'Station B' },
    { id: 'w-003', name: 'Fatma Şahin', email: 'fatma@burkol.com', skills: ['Assembly', 'Packaging'], shift: 'Day', status: 'break', currentTask: 'WO-003', station: 'Station C' }
  ],
  stations: [
    { id: 's-001', name: 'Station A - Welding', status: 'active', worker: 'Ali Kaya', capabilities: ['Welding', 'Cutting'], currentOperation: 'WO-001 Welding' },
    { id: 's-002', name: 'Station B - Assembly', status: 'maintenance', worker: null, capabilities: ['Assembly', 'Quality Control'], currentOperation: null }
  ],
  operations: [
    { id: 'op-001', name: 'Welding', duration: 30, skills: ['Welding'], qualityCheck: true },
    { id: 'op-002', name: 'Cutting', duration: 15, skills: ['Cutting'], qualityCheck: false },
    { id: 'op-003', name: 'Assembly', duration: 45, skills: ['Assembly'], qualityCheck: true }
  ]
};

export function updateWorkOrderProgress(orderId, newProgress) {
  const order = MESData.workOrders.find(wo => wo.id === orderId);
  if (order) {
    order.progress = newProgress;
    if (newProgress >= 100) order.status = 'completed';
  }
}

export function addWorkOrder(orderData) {
  const newOrder = { id: 'WO-' + String(Date.now()).slice(-3), ...orderData, progress: 0, status: 'planned' };
  MESData.workOrders.push(newOrder);
}

export function assignWorkerToOrder(workerId, orderId) {
  const worker = MESData.workers.find(w => w.id === workerId);
  const order = MESData.workOrders.find(wo => wo.id === orderId);
  if (worker && order) {
    worker.currentTask = orderId;
    worker.status = 'active';
    order.status = 'in-progress';
  }
}

export function saveData() {
  localStorage.setItem('mesData', JSON.stringify(MESData));
}

export function loadData() {
  const saved = localStorage.getItem('mesData');
  if (saved) {
    const parsedData = JSON.parse(saved);
    Object.assign(MESData, parsedData);
  }
}

