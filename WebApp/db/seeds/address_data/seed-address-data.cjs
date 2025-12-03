/**
 * Address Data Seeder
 * JSON dosyalarından address_data schema'sına veri yükler
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'beeplan_dev',
  user: process.env.DB_USER || 'umutyalcin',
  password: process.env.DB_PASSWORD || ''
});

const dataDir = __dirname;

async function seedTable(client, tableName, jsonFile, transform = null) {
  const filePath = path.join(dataDir, jsonFile);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  console.log(`📦 Seeding ${tableName}: ${data.length} records...`);
  
  let inserted = 0;
  const batchSize = 500;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    for (const record of batch) {
      const row = transform ? transform(record) : record;
      const columns = Object.keys(row);
      const values = Object.values(row);
      const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
      
      const query = `
        INSERT INTO address_data.${tableName} (${columns.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (id) DO NOTHING
      `;
      
      try {
        await client.query(query, values);
        inserted++;
      } catch (err) {
        console.error(`Error inserting into ${tableName}:`, row, err.message);
      }
    }
    
    process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, data.length)}/${data.length}`);
  }
  
  console.log(`\n✅ ${tableName}: ${inserted} records inserted`);
  return inserted;
}

async function main() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting address data seed...\n');
    
    // 1. Countries
    await seedTable(client, 'countries', 'countries.json', (r) => ({
      id: r.id,
      name: r.name,
      phone_code: r.phone_code || null,
      is_active: r.is_active !== undefined ? r.is_active : true,
      sort_order: r.sort_order || 0
    }));
    
    // 2. Cities
    await seedTable(client, 'cities', 'cities.json', (r) => ({
      id: r.id,
      country_id: r.country_id || 228, // Turkey default
      name: r.name
    }));
    
    // 3. Counties (İlçeler)
    await seedTable(client, 'counties', 'counties.json', (r) => ({
      id: r.id,
      city_id: r.city_id,
      name: r.name
    }));
    
    // 4. Districts (Semtler)
    await seedTable(client, 'districts', 'districts.json', (r) => ({
      id: r.id,
      county_id: r.county_id,
      name: r.name
    }));
    
    // 5. Neighbourhoods (Mahalleler)
    await seedTable(client, 'neighbourhoods', 'neighbourhoods.json', (r) => ({
      id: r.id,
      district_id: r.district_id,
      name: r.name,
      post_code: r.post_code || null
    }));
    
    console.log('\n🎉 Address data seeding completed!');
    
    // Verify counts
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM address_data.countries) as countries,
        (SELECT COUNT(*) FROM address_data.cities) as cities,
        (SELECT COUNT(*) FROM address_data.counties) as counties,
        (SELECT COUNT(*) FROM address_data.districts) as districts,
        (SELECT COUNT(*) FROM address_data.neighbourhoods) as neighbourhoods
    `);
    
    console.log('\n📊 Final counts:');
    console.log(`   Countries: ${counts.rows[0].countries}`);
    console.log(`   Cities: ${counts.rows[0].cities}`);
    console.log(`   Counties: ${counts.rows[0].counties}`);
    console.log(`   Districts: ${counts.rows[0].districts}`);
    console.log(`   Neighbourhoods: ${counts.rows[0].neighbourhoods}`);
    
  } catch (err) {
    console.error('❌ Seed error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
