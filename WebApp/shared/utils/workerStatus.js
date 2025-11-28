/**
 * Centralized Worker Status Utilities
 * Provides consistent status labels, badge colors, and leave handling across the application
 */

// Status enum values (backend values)
export const WorkerStatus = {
  AVAILABLE: 'available',
  BUSY: 'busy',
  BREAK: 'break',
  INACTIVE: 'inactive',
  LEAVE_SICK: 'leave-sick',      // UI-only computed from leaveReason
  LEAVE_VACATION: 'leave-vacation' // UI-only computed from leaveReason
};

// Leave reason values (stored in leaveReason field)
export const LeaveReason = {
  SICK: 'Hasta',
  VACATION: 'İzinli'
};

/**
 * Get Turkish label for worker status
 * @param {string} status - Worker status enum value
 * @returns {string} Turkish label
 */
export function getStatusLabel(status) {
  const labels = {
    [WorkerStatus.AVAILABLE]: 'Çalışıyor',
    [WorkerStatus.BUSY]: 'Meşgul',
    [WorkerStatus.BREAK]: 'Mola',
    [WorkerStatus.INACTIVE]: 'İşten ayrıldı',
    [WorkerStatus.LEAVE_SICK]: 'Hasta',
    [WorkerStatus.LEAVE_VACATION]: 'İzinli'
  };
  return labels[status] || status;
}

/**
 * Get badge CSS class for worker status
 * @param {string} status - Worker status enum value
 * @returns {string} CSS class name
 */
export function getStatusBadgeClass(status) {
  const classes = {
    [WorkerStatus.AVAILABLE]: 'badge-success',
    [WorkerStatus.BUSY]: 'badge-warning',
    [WorkerStatus.BREAK]: 'badge-info',
    [WorkerStatus.INACTIVE]: 'badge-secondary',
    [WorkerStatus.LEAVE_SICK]: 'badge-error',
    [WorkerStatus.LEAVE_VACATION]: 'badge-warning'
  };
  return classes[status] || 'badge-secondary';
}

/**
 * Check if worker is currently on leave
 * @param {Object} worker - Worker object
 * @returns {boolean} True if worker is on leave
 */
export function isWorkerOnLeave(worker) {
  if (!worker.leaveStart || !worker.leaveEnd) return false;
  
  const now = new Date();
  const start = new Date(worker.leaveStart);
  const end = new Date(worker.leaveEnd);
  
  return now >= start && now <= end;
}

/**
 * Compute effective UI status (considering leave state)
 * @param {Object} worker - Worker object with status, leaveStart, leaveEnd, leaveReason
 * @returns {string} Effective status for UI display
 */
export function getEffectiveStatus(worker) {
  const onLeave = isWorkerOnLeave(worker);
  
  if (onLeave && worker.leaveReason) {
    return worker.leaveReason === LeaveReason.SICK 
      ? WorkerStatus.LEAVE_SICK 
      : WorkerStatus.LEAVE_VACATION;
  }
  
  return (worker.status || WorkerStatus.AVAILABLE).toLowerCase();
}

/**
 * Check if worker is available for assignments
 * @param {Object} worker - Worker object
 * @returns {boolean} True if worker can be assigned tasks
 */
export function isWorkerAvailable(worker) {
  const status = worker.status?.toLowerCase();
  
  // Inactive workers cannot be assigned
  if (status === WorkerStatus.INACTIVE) return false;
  
  // Workers on break should not be auto-assigned
  if (status === WorkerStatus.BREAK) return false;
  
  // Workers on leave cannot be assigned
  if (isWorkerOnLeave(worker)) return false;
  
  return true;
}

/**
 * Format leave dates for display
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {string} Formatted date range (e.g., "01.02 - 05.02")
 */
export function formatLeaveDates(startDate, endDate) {
  if (!startDate || !endDate) return '';
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}`;
  };
  
  return `${formatDate(start)} - ${formatDate(end)}`;
}

/**
 * Get worker status banner info for Worker Portal
 * @param {Object} worker - Worker object
 * @returns {Object|null} Banner config with { icon, message, type } or null if no banner
 */
export function getWorkerStatusBanner(worker) {
  const status = worker.status?.toLowerCase();
  const onLeave = isWorkerOnLeave(worker);
  
  // Inactive worker
  if (status === WorkerStatus.INACTIVE) {
    return {
      icon: '❌',
      message: 'Bu çalışan işten ayrıldı, görev başlatılamaz.',
      type: 'error'
    };
  }
  
  // On leave
  if (onLeave && worker.leaveReason) {
    const dates = formatLeaveDates(worker.leaveStart, worker.leaveEnd);
    const reason = worker.leaveReason === LeaveReason.SICK ? 'Hasta' : 'İzinli';
    return {
      icon: worker.leaveReason === LeaveReason.SICK ? '🩺' : '🏖️',
      message: `${reason} (${dates}). Bu tarihler arasında görev başlatamazsınız.`,
      type: 'warning'
    };
  }
  
  // On break
  if (status === WorkerStatus.BREAK) {
    return {
      icon: '☕',
      message: 'Mola - Görevlere devam etmek için durumunuzu "Çalışıyor" olarak güncelleyin.',
      type: 'info'
    };
  }
  
  return null;
}

/**
 * Get all status filter options for UI dropdowns
 * @returns {Array<{value: string, label: string}>} Filter options
 */
export function getStatusFilterOptions() {
  return [
    { value: WorkerStatus.AVAILABLE, label: getStatusLabel(WorkerStatus.AVAILABLE) },
    { value: WorkerStatus.BUSY, label: getStatusLabel(WorkerStatus.BUSY) },
    { value: WorkerStatus.BREAK, label: getStatusLabel(WorkerStatus.BREAK) },
    { value: WorkerStatus.INACTIVE, label: getStatusLabel(WorkerStatus.INACTIVE) },
    { value: WorkerStatus.LEAVE_VACATION, label: getStatusLabel(WorkerStatus.LEAVE_VACATION) },
    { value: WorkerStatus.LEAVE_SICK, label: getStatusLabel(WorkerStatus.LEAVE_SICK) }
  ];
}

/**
 * Aggregate workers by status for dashboard
 * @param {Array<Object>} workers - Array of worker objects
 * @returns {Object} Status counts { available, busy, break, inactive, onLeave }
 */
export function aggregateWorkersByStatus(workers) {
  const counts = {
    available: 0,
    busy: 0,
    break: 0,
    inactive: 0,
    leaveSick: 0,
    leaveVacation: 0
  };
  
  workers.forEach(worker => {
    const effectiveStatus = getEffectiveStatus(worker);
    
    switch (effectiveStatus) {
      case WorkerStatus.AVAILABLE:
        counts.available++;
        break;
      case WorkerStatus.BUSY:
        counts.busy++;
        break;
      case WorkerStatus.BREAK:
        counts.break++;
        break;
      case WorkerStatus.INACTIVE:
        counts.inactive++;
        break;
      case WorkerStatus.LEAVE_SICK:
        counts.leaveSick++;
        break;
      case WorkerStatus.LEAVE_VACATION:
        counts.leaveVacation++;
        break;
    }
  });
  
  return counts;
}

/**
 * Check if worker is currently in a break period according to schedule
 * @param {Object} worker - Worker object with personalSchedule
 * @returns {boolean} True if worker is currently in a scheduled break
 */
export function isWorkerInScheduledBreak(worker) {
  const schedule = worker.personalSchedule;
  if (!schedule) return false;
  
  // Determine blocks for current day
  let blocks = [];
  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = dayNames[now.getDay()];
  
  if (schedule.mode === 'company') {
    // Would need company settings loaded, skip for now
    // In Worker Portal context, this would be pre-computed and passed
    return false;
  } else if (schedule.mode === 'personal') {
    blocks = schedule.blocks?.[currentDay] || [];
  }
  
  // Check current time against blocks
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  for (const block of blocks) {
    if (block.type !== 'break') continue;
    
    const [startHour, startMin] = block.start.split(':').map(Number);
    const [endHour, endMin] = block.end.split(':').map(Number);
    const blockStart = startHour * 60 + startMin;
    const blockEnd = endHour * 60 + endMin;
    
    if (currentMinutes >= blockStart && currentMinutes < blockEnd) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if worker can start/continue tasks based on general status + schedule
 * @param {Object} worker - Worker object
 * @returns {Object} { canWork: boolean, reason: string|null }
 */
export function canWorkerStartTasks(worker) {
  const status = worker.status?.toLowerCase();
  
  // Inactive workers cannot work
  if (status === WorkerStatus.INACTIVE) {
    return { canWork: false, reason: 'İşten ayrıldı' };
  }
  
  // On leave cannot work
  if (isWorkerOnLeave(worker)) {
    const reason = worker.leaveReason === LeaveReason.SICK ? 'Hasta' : 'İzinli';
    return { canWork: false, reason };
  }
  
  // Manual break status
  if (status === WorkerStatus.BREAK) {
    return { canWork: false, reason: 'Mola' };
  }
  
  // Check scheduled break (if applicable)
  if (isWorkerInScheduledBreak(worker)) {
    return { canWork: false, reason: 'Mesai programına göre mola saatinde' };
  }
  
  return { canWork: true, reason: null };
}
