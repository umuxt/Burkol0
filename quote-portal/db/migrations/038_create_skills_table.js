/**
 * Migration 038: Create Skills Reference Table
 * 
 * Creates mes.skills table for centralized skill management
 * Each skill has a unique key (skill-001) and customizable name
 * Workers, stations, operations reference skills by key
 * 
 * This enables:
 * - Company-specific skill sets
 * - Easy skill renaming without breaking references
 * - Simple matching algorithm (key comparison)
 * - Future i18n support
 */

export async function up(knex) {
  console.log('📋 Migration 038: Creating skills reference table...');
  
  // Create skills table
  await knex.schema.withSchema('mes').createTable('skills', (table) => {
    table.string('id', 50).primary().comment('Skill key (skill-001, skill-002)');
    table.string('name', 255).notNullable().comment('Display name (user customizable)');
    table.text('description').comment('Optional skill description');
    table.boolean('is_active').defaultTo(true).comment('Soft delete flag');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.string('created_by').comment('User who created this skill');
    table.string('updated_by').comment('User who last updated this skill');
    
    // Indexes
    table.index('name', 'idx_skills_name');
    table.index('is_active', 'idx_skills_is_active');
  });

  console.log('✅ mes.skills table created');
  
  // Insert default skills for bootstrapping
  await knex('mes.skills').insert([
    {
      id: 'skill-001',
      name: 'TIG Kaynağı',
      description: 'Tungsten Inert Gas kaynağı',
      is_active: true,
      created_at: knex.fn.now(),
      created_by: 'system'
    },
    {
      id: 'skill-002',
      name: 'MIG Kaynağı',
      description: 'Metal Inert Gas kaynağı',
      is_active: true,
      created_at: knex.fn.now(),
      created_by: 'system'
    },
    {
      id: 'skill-003',
      name: 'Freze',
      description: 'CNC freze işleme',
      is_active: true,
      created_at: knex.fn.now(),
      created_by: 'system'
    },
    {
      id: 'skill-004',
      name: 'Torna',
      description: 'CNC torna işleme',
      is_active: true,
      created_at: knex.fn.now(),
      created_by: 'system'
    },
    {
      id: 'skill-005',
      name: 'Montaj',
      description: 'Ürün montajı',
      is_active: true,
      created_at: knex.fn.now(),
      created_by: 'system'
    },
    {
      id: 'skill-006',
      name: 'Kalite Kontrol',
      description: 'Ürün kalite kontrolü',
      is_active: true,
      created_at: knex.fn.now(),
      created_by: 'system'
    },
    {
      id: 'skill-007',
      name: 'Bükme',
      description: 'Sac/profil bükme',
      is_active: true,
      created_at: knex.fn.now(),
      created_by: 'system'
    },
    {
      id: 'skill-008',
      name: 'Lazer Kesim',
      description: 'Lazer ile kesim',
      is_active: true,
      created_at: knex.fn.now(),
      created_by: 'system'
    }
  ]);

  console.log('✅ Default skills inserted (skill-001 to skill-008)');
  
  // Update existing test data to use skill keys
  console.log('🔄 Updating existing data to use skill keys...');
  
  // Update workers (convert Turkish names to skill keys)
  const workers = await knex('mes.workers').select('*');
  for (const worker of workers) {
    if (worker.skills && Array.isArray(worker.skills)) {
      const mappedSkills = worker.skills.map(skill => {
        // Map old values to new skill keys
        const mapping = {
          'Kaynak': 'skill-001',
          'TIG Kaynağı': 'skill-001',
          'MIG Kaynağı': 'skill-002',
          'Freze': 'skill-003',
          'Torna': 'skill-004',
          'Montaj': 'skill-005',
          'Kontrol': 'skill-006',
          'Kalite Kontrol': 'skill-006',
          'Bükme': 'skill-007',
          'Paketleme': 'skill-005' // Map to Montaj for now
        };
        return mapping[skill] || skill; // Keep unchanged if not in mapping
      });
      
      await knex('mes.workers')
        .where({ id: worker.id })
        .update({ skills: JSON.stringify(mappedSkills) });
    }
  }
  
  console.log('✅ Workers updated with skill keys');
  
  // Update stations (convert English names to skill keys)
  const stations = await knex('mes.stations').select('*');
  for (const station of stations) {
    if (station.capabilities && Array.isArray(station.capabilities)) {
      const mappedCaps = station.capabilities.map(cap => {
        const mapping = {
          'tig_welding': 'skill-001',
          'mig_welding': 'skill-002',
          'milling': 'skill-003',
          'turning': 'skill-004',
          'assembly': 'skill-005',
          'quality_check': 'skill-006',
          'sheet_bending': 'skill-007',
          'tube_bending': 'skill-007',
          'laser_cutting': 'skill-008'
        };
        return mapping[cap] || cap;
      });
      
      await knex('mes.stations')
        .where({ id: station.id })
        .update({ capabilities: JSON.stringify(mappedCaps) });
    }
  }
  
  console.log('✅ Stations updated with skill keys');
  
  console.log('✅ Migration 038 completed successfully!');
}

export async function down(knex) {
  console.log('⏪ Rolling back Migration 038...');
  
  // Revert workers and stations data (if needed)
  // Note: This is destructive, you may want to keep a backup
  
  await knex.schema.withSchema('mes').dropTableIfExists('skills');
  
  console.log('✅ Migration 038 rolled back');
}
