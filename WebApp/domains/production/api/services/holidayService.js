/**
 * Holiday Service
 * Manages company holidays and work schedule integration
 */

import db from '#db/connection';

/**
 * Get all company holidays
 */
export async function getHolidays() {
  const result = await db('mes.settings')
    .where('key', 'company-holidays')
    .first();
  
  if (!result || !result.value) {
    return [];
  }
  
  const data = typeof result.value === 'string' 
    ? JSON.parse(result.value) 
    : result.value;
  
  return data.holidays || [];
}

/**
 * Create a new holiday
 */
export async function createHoliday(holidayData) {
  const { name, startDate, endDate, isWorkingDay = false, workHours = null } = holidayData;
  
  if (!name || !startDate || !endDate) {
    throw new Error('name, startDate, and endDate are required');
  }
  
  // Get existing holidays
  const existing = await db('mes.settings')
    .where('key', 'company-holidays')
    .first();
  
  let holidays = [];
  if (existing && existing.value) {
    const data = typeof existing.value === 'string' 
      ? JSON.parse(existing.value) 
      : existing.value;
    holidays = data.holidays || [];
  }
  
  // Generate new ID
  const maxId = holidays.reduce((max, h) => {
    const id = parseInt(h.id?.replace('HOL-', '') || '0', 10);
    return Math.max(max, id);
  }, 0);
  const newId = `HOL-${String(maxId + 1).padStart(3, '0')}`;
  
  // Add new holiday
  const newHoliday = {
    id: newId,
    name,
    startDate,
    endDate,
    isWorkingDay,
    workHours,
    createdAt: new Date().toISOString()
  };
  
  holidays.push(newHoliday);
  
  // Save back to database
  await db('mes.settings')
    .insert({
      key: 'company-holidays',
      value: JSON.stringify({ holidays })
    })
    .onConflict('key')
    .merge();
  
  return newHoliday;
}

/**
 * Update an existing holiday
 */
export async function updateHoliday(id, holidayData) {
  const existing = await db('mes.settings')
    .where('key', 'company-holidays')
    .first();
  
  if (!existing || !existing.value) {
    throw new Error('No holidays found');
  }
  
  const data = typeof existing.value === 'string' 
    ? JSON.parse(existing.value) 
    : existing.value;
  
  const holidays = data.holidays || [];
  const index = holidays.findIndex(h => h.id === id);
  
  if (index === -1) {
    return null;
  }
  
  // Update holiday
  holidays[index] = {
    ...holidays[index],
    ...holidayData,
    id, // Keep original ID
    updatedAt: new Date().toISOString()
  };
  
  // Save back to database
  await db('mes.settings')
    .where('key', 'company-holidays')
    .update({
      value: JSON.stringify({ holidays })
    });
  
  return holidays[index];
}

/**
 * Delete a holiday
 */
export async function deleteHoliday(id) {
  const existing = await db('mes.settings')
    .where('key', 'company-holidays')
    .first();
  
  if (!existing || !existing.value) {
    return false;
  }
  
  const data = typeof existing.value === 'string' 
    ? JSON.parse(existing.value) 
    : existing.value;
  
  const holidays = data.holidays || [];
  const index = holidays.findIndex(h => h.id === id);
  
  if (index === -1) {
    return false;
  }
  
  // Remove holiday
  holidays.splice(index, 1);
  
  // Save back to database
  await db('mes.settings')
    .where('key', 'company-holidays')
    .update({
      value: JSON.stringify({ holidays })
    });
  
  return true;
}

/**
 * Check if a date is a holiday
 */
export async function isHoliday(date) {
  const checkDate = new Date(date);
  const checkYear = checkDate.getUTCFullYear();
  const checkMonth = checkDate.getUTCMonth();
  const checkDay = checkDate.getUTCDate();
  
  const holidays = await getHolidays();
  
  const holiday = holidays.find(h => {
    const start = new Date(h.startDate);
    const end = new Date(h.endDate);
    
    const startYear = start.getUTCFullYear();
    const startMonth = start.getUTCMonth();
    const startDay = start.getUTCDate();
    
    const endYear = end.getUTCFullYear();
    const endMonth = end.getUTCMonth();
    const endDay = end.getUTCDate();
    
    const checkDateNum = checkYear * 10000 + checkMonth * 100 + checkDay;
    const startDateNum = startYear * 10000 + startMonth * 100 + startDay;
    const endDateNum = endYear * 10000 + endMonth * 100 + endDay;
    
    return checkDateNum >= startDateNum && checkDateNum <= endDateNum;
  });
  
  return holiday || null;
}

/**
 * Get company timezone
 */
export async function getTimezone() {
  const result = await db('mes.settings')
    .where('key', 'company-timezone')
    .first();
  
  if (!result || !result.value) {
    return { timezone: 'Europe/Istanbul' };
  }
  
  const data = typeof result.value === 'string' 
    ? JSON.parse(result.value) 
    : result.value;
  
  return data;
}

/**
 * Update company timezone
 */
export async function updateTimezone(timezone) {
  if (!timezone) {
    throw new Error('timezone is required');
  }
  
  await db('mes.settings')
    .insert({
      key: 'company-timezone',
      value: JSON.stringify({ timezone })
    })
    .onConflict('key')
    .merge();
  
  return { timezone };
}
