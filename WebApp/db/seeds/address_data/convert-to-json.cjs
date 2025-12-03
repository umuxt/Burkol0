/**
 * PHP Seeder dosyalarını JSON'a çevir
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;

function parsePhpSeeder(filename) {
  console.log(`\nParsing ${filename}...`);
  const content = fs.readFileSync(path.join(dir, filename), 'utf-8');
  const items = [];
  
  // Format 1: key => [ ... ]  (countries, cities, neighbourhoods)
  const regex1 = /\d+\s*=>\s*\[\s*([^\]]+)\]/g;
  let match;
  
  while ((match = regex1.exec(content)) !== null) {
    const itemContent = match[1];
    const item = {};
    
    const fieldRegex = /'(\w+)'\s*=>\s*(?:'([^']*)'|(\d+)|null)/g;
    let fieldMatch;
    
    while ((fieldMatch = fieldRegex.exec(itemContent)) !== null) {
      const key = fieldMatch[1];
      const value = fieldMatch[2] !== undefined ? fieldMatch[2] : 
                    fieldMatch[3] !== undefined ? parseInt(fieldMatch[3]) : null;
      item[key] = value;
    }
    
    if (Object.keys(item).length > 0) {
      items.push(item);
    }
  }
  
  // Format 2: array('id' => X, 'city_id' => Y, 'name' => 'Z')  (counties, districts)
  if (items.length === 0) {
    const regex2 = /array\s*\(\s*'id'\s*=>\s*(\d+)\s*,\s*'(\w+)_id'\s*=>\s*(\d+)\s*,\s*'name'\s*=>\s*'([^']+)'/g;
    
    while ((match = regex2.exec(content)) !== null) {
      items.push({
        id: parseInt(match[1]),
        [match[2] + '_id']: parseInt(match[3]),
        name: match[4]
      });
    }
  }
  
  console.log(`  Found ${items.length} records`);
  return items;
}

// Parse all files
const countries = parsePhpSeeder('countries.php');
const cities = parsePhpSeeder('cities.php');
const counties = parsePhpSeeder('counties.php');
const districts = parsePhpSeeder('districts.php');
const neighbourhoods = parsePhpSeeder('neighbourhoods.php');

// Write JSON files
fs.writeFileSync(path.join(dir, 'countries.json'), JSON.stringify(countries, null, 2));
fs.writeFileSync(path.join(dir, 'cities.json'), JSON.stringify(cities, null, 2));
fs.writeFileSync(path.join(dir, 'counties.json'), JSON.stringify(counties, null, 2));
fs.writeFileSync(path.join(dir, 'districts.json'), JSON.stringify(districts, null, 2));
fs.writeFileSync(path.join(dir, 'neighbourhoods.json'), JSON.stringify(neighbourhoods, null, 2));

console.log('\n✅ All files converted to JSON');
console.log(`
Summary:
- countries.json: ${countries.length} records
- cities.json: ${cities.length} records (81 il)
- counties.json: ${counties.length} records (ilçeler)
- districts.json: ${districts.length} records (semtler)
- neighbourhoods.json: ${neighbourhoods.length} records (mahalleler + posta kodu)
`);
