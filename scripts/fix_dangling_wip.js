
import db from '../quote-portal/db/connection.js';

async function fixDanglingWip() {
  try {
    console.log('🔍 Starting analysis of dangling WIP records...');

    // 1. Find all completed assignments
    const completedAssignments = await db('mes.worker_assignments')
      .where('status', 'completed')
      .select('id', 'reference', 'workerId', 'completed_at', 'updated_at');

    console.log(`Found ${completedAssignments.length} completed assignments.`);

    let fixedCount = 0;

    for (const assignment of completedAssignments) {
      // 2. Get stock movements for this assignment
      const movements = await db('materials.stock_movements')
        .where('assignmentId', assignment.id);

      // Check for WIP reservation
      const wipMovements = movements.filter(m => m.subType === 'wip_reservation');
      
      if (wipMovements.length === 0) continue; // No WIP to fix

      // Check for Adjustment
      const hasAdjustment = movements.some(m => m.subType === 'adjustment');

      if (!hasAdjustment) {
        console.log(`⚠️ Assignment ${assignment.id} (${assignment.reference}) has WIP but NO adjustment. Fixing...`);

        for (const wip of wipMovements) {
           // Create adjustment record
           // Assuming consumption matched reservation (net change 0 relative to reservation)
           // Logic: Realized = WIP + Adjustment. 
           // If Realized should be WIP amount, Adjustment should be 0.
           
           const adjustmentData = {
             materialId: wip.materialId,
             materialCode: wip.materialCode,
             materialName: wip.materialName,
             type: 'out', // dummy type
             subType: 'adjustment',
             status: 'adjustment',
             quantity: 0, // Zero adjustment means consumed exactly what was reserved
             unit: wip.unit,
             stockBefore: wip.stockAfter, // Approximate
             stockAfter: wip.stockAfter,  // No change to stock
             reference: wip.reference,
             referenceType: wip.referenceType,
             relatedPlanId: wip.relatedPlanId,
             relatedNodeId: wip.relatedNodeId,
             warehouse: wip.warehouse,
             location: wip.location,
             notes: 'Otomatik düzeltme: Tamamlanan iş emri için eksik ayarlama kaydı oluşturuldu.',
             movementDate: assignment.completed_at || assignment.updated_at || new Date(),
             userId: wip.userId,
             userName: wip.userName,
             assignmentId: assignment.id,
             adjustedQuantity: 0,
             reservedQuantity: Math.abs(wip.quantity), // Reference the original reservation
             partialReservation: false
           };

           await db('materials.stock_movements').insert(adjustmentData);
           console.log(`   ✅ Created adjustment for material ${wip.materialCode}`);
        }
        fixedCount++;
      }
    }

    console.log(`\n🎉 Finished! Fixed ${fixedCount} assignments.`);
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixDanglingWip();
