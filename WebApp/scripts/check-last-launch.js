import db from '../db/connection.js';

async function checkLastLaunch() {
  try {
    // En son launch edilen planları kontrol et
    const recentNodes = await db('mes.production_plan_nodes')
      .whereNotNull('estimatedStartTime')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .select('id', 'planId', 'name', 'estimatedStartTime', 'estimatedEndTime', 'createdAt');
    
    console.log('=== Son 10 Node ===');
    for (const node of recentNodes) {
      const start = new Date(node.estimatedStartTime);
      const end = new Date(node.estimatedEndTime);
      const created = new Date(node.createdAt);
      
      const startHour = start.getHours();
      const isOutsideWorkHours = startHour < 8 || startHour >= 18;
      
      console.log(`Node ${node.id} (${node.name || 'N/A'}):`);
      console.log(`  Plan: ${node.planId}`);
      console.log(`  Created: ${created.toLocaleString('tr-TR', {timeZone: 'Europe/Istanbul'})}`);
      console.log(`  Start: ${start.toLocaleString('tr-TR', {timeZone: 'Europe/Istanbul'})} ${isOutsideWorkHours ? '⚠️ OUTSIDE WORK HOURS!' : '✅'}`);
      console.log(`  End: ${end.toLocaleString('tr-TR', {timeZone: 'Europe/Istanbul'})}`);
      console.log('');
    }

    // mesRoutes.js'nin son değiştirilme tarihini kontrol et
    const fs = await import('fs');
    const stat = fs.statSync('./server/mesRoutes.js');
    console.log('=== mesRoutes.js Son Değiştirilme ===');
    console.log(stat.mtime.toLocaleString('tr-TR', {timeZone: 'Europe/Istanbul'}));

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkLastLaunch();
