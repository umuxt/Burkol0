// Firebase Data Migration Script
// Bu script mevcut dummy datayı Firebase'e aktarır

import { MaterialsService, CategoriesService } from '../src/lib/materials-service.js';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Migration configuration
const MIGRATION_CONFIG = {
  dryRun: false, // true yaparsanız sadece simulation çalışır
  batchSize: 10,
  logLevel: 'verbose', // 'minimal', 'verbose'
  validateData: true
};

// ================================
// DUMMY DATA (Mevcut sistemden)
// ================================

const DUMMY_CATEGORIES = [
  {
    id: 'cat-001',
    name: 'Elektrik Malzemeleri',
    code: 'ELEK',
    description: 'Elektrik ve elektronik malzemeleri',
    color: '#FF6B6B',
    icon: 'electric-plug',
    sortOrder: 1,
    tags: ['elektrik', 'elektronik', 'kablo']
  },
  {
    id: 'cat-002', 
    name: 'Sıhhi Tesisat',
    code: 'SIHI',
    description: 'Su ve kanalizasyon malzemeleri',
    color: '#4ECDC4',
    icon: 'water-drop',
    sortOrder: 2,
    tags: ['su', 'tesisat', 'boru']
  },
  {
    id: 'cat-003',
    name: 'İnşaat Malzemeleri', 
    code: 'INSA',
    description: 'Genel inşaat malzemeleri',
    color: '#45B7D1',
    icon: 'building',
    sortOrder: 3,
    tags: ['inşaat', 'yapı', 'malzeme']
  },
  {
    id: 'cat-004',
    name: 'Boyalar',
    code: 'BOYA',
    description: 'Boya ve kimyasal malzemeler',
    color: '#96CEB4',
    icon: 'paint-brush',
    sortOrder: 4,
    tags: ['boya', 'kimyasal', 'vernik']
  },
  {
    id: 'cat-005',
    name: 'Hırdavat',
    code: 'HIRD',
    description: 'Küçük hırdavat malzemeleri',
    color: '#FECA57',
    icon: 'tools',
    sortOrder: 5,
    tags: ['vida', 'somun', 'hırdavat']
  }
];

const DUMMY_MATERIALS = [
  // Elektrik Malzemeleri
  {
    code: 'ELK-001',
    name: 'NYA Kablo 2.5mm² (100m)',
    type: 'Kablo',
    category: 'cat-001',
    unit: 'Metre',
    stock: 850,
    reorderPoint: 100,
    costPrice: 12.50,
    sellPrice: 18.75,
    supplier: 'Türk Prysmian',
    status: 'Aktif',
    description: 'Çok damarlı esnek bakır kablo',
    specifications: {
      voltage: '450/750V',
      material: 'Bakır',
      insulation: 'PVC',
      color: 'Mavi'
    }
  },
  {
    code: 'ELK-002', 
    name: 'LED Ampul 12W E27',
    type: 'Aydınlatma',
    category: 'cat-001',
    unit: 'Adet',
    stock: 245,
    reorderPoint: 50,
    costPrice: 8.90,
    sellPrice: 14.50,
    supplier: 'Osram Türkiye',
    status: 'Aktif',
    description: '12W LED ampul, beyaz ışık',
    specifications: {
      power: '12W',
      lumens: '1100lm',
      colorTemp: '4000K',
      lifespan: '25000 saat'
    }
  },
  {
    code: 'ELK-003',
    name: 'Anahtar Priz Takımı',
    type: 'Anahtar-Priz',
    category: 'cat-001', 
    unit: 'Takım',
    stock: 125,
    reorderPoint: 25,
    costPrice: 25.00,
    sellPrice: 42.00,
    supplier: 'Schneider Electric',
    status: 'Aktif',
    description: 'Beyaz renk anahtar priz takımı',
    specifications: {
      series: 'Unica',
      color: 'Beyaz',
      frame: 'Plastik',
      ip: 'IP20'
    }
  },

  // Sıhhi Tesisat
  {
    code: 'SHT-001',
    name: 'PPR Boru Ø32mm (4m)',
    type: 'Boru',
    category: 'cat-002',
    unit: 'Adet',
    stock: 180,
    reorderPoint: 30,
    costPrice: 15.75,
    sellPrice: 24.50,
    supplier: 'Pilsa',
    status: 'Aktif',
    description: 'Polipropilen rastgele kopolimer boru',
    specifications: {
      diameter: '32mm',
      thickness: '3.0mm',
      pressure: 'PN20',
      length: '4 metre'
    }
  },
  {
    code: 'SHT-002',
    name: 'PPR Dirsek 90° Ø32mm',
    type: 'Ek Parça',
    category: 'cat-002',
    unit: 'Adet', 
    stock: 95,
    reorderPoint: 20,
    costPrice: 2.80,
    sellPrice: 4.50,
    supplier: 'Pilsa',
    status: 'Aktif',
    description: 'PPR boru için 90 derece dirsek',
    specifications: {
      diameter: '32mm',
      angle: '90°',
      material: 'PPR',
      color: 'Beyaz'
    }
  },
  {
    code: 'SHT-003',
    name: 'Musluk Bataryası (Lavabo)',
    type: 'Batarya',
    category: 'cat-002',
    unit: 'Adet',
    stock: 45,
    reorderPoint: 10,
    costPrice: 85.00,
    sellPrice: 135.00,
    supplier: 'VitrA',
    status: 'Aktif',
    description: 'Krom kaplama lavabo bataryası',
    specifications: {
      finish: 'Krom',
      type: 'Tek kol',
      aerator: 'Var',
      warranty: '5 yıl'
    }
  },

  // İnşaat Malzemeleri
  {
    code: 'INS-001',
    name: 'Çimento (50kg)',
    type: 'Bağlayıcı',
    category: 'cat-003',
    unit: 'Çuval',
    stock: 120,
    reorderPoint: 20,
    costPrice: 28.50,
    sellPrice: 42.00,
    supplier: 'Akçansa',
    status: 'Aktif',
    description: 'Portland çimentosu CEM I 42.5 R',
    specifications: {
      type: 'CEM I 42.5 R',
      weight: '50kg',
      strength: '42.5 MPa',
      setting: 'Hızlı'
    }
  },
  {
    code: 'INS-002',
    name: 'Kum (1m³)',
    type: 'Agrega',
    category: 'cat-003',
    unit: 'm³',
    stock: 25,
    reorderPoint: 5,
    costPrice: 45.00,
    sellPrice: 65.00,
    supplier: 'Yerel Tedarikçi',
    status: 'Aktif',
    description: 'İnşaat kumu, yıkanmış',
    specifications: {
      type: 'İnşaat kumu',
      grain: '0-4mm',
      moisture: '< 5%',
      organic: 'Temiz'
    }
  },

  // Boyalar
  {
    code: 'BOY-001',
    name: 'İç Cephe Boyası (15L)',
    type: 'İç Boya',
    category: 'cat-004',
    unit: 'Bidon',
    stock: 35,
    reorderPoint: 8,
    costPrice: 125.00,
    sellPrice: 185.00,
    supplier: 'Filli Boya',
    status: 'Aktif',
    description: 'Silikonlu iç cephe boyası, beyaz',
    specifications: {
      coverage: '12-14 m²/L',
      dryTime: '2-3 saat',
      base: 'Su bazlı',
      color: 'Beyaz'
    }
  },
  {
    code: 'BOY-002',
    name: 'Dış Cephe Boyası (15L)',
    type: 'Dış Boya',
    category: 'cat-004',
    unit: 'Bidon',
    stock: 22,
    reorderPoint: 5,
    costPrice: 165.00,
    sellPrice: 245.00,
    supplier: 'Filli Boya',
    status: 'Aktif',
    description: 'Silikonlu dış cephe boyası, beyaz',
    specifications: {
      coverage: '10-12 m²/L',
      dryTime: '4-6 saat',
      base: 'Su bazlı',
      weather: 'Dirençli'
    }
  },

  // Hırdavat
  {
    code: 'HRD-001',
    name: 'İmbus Vida M8x50 (100 adet)',
    type: 'Vida',
    category: 'cat-005',
    unit: 'Paket',
    stock: 75,
    reorderPoint: 15,
    costPrice: 12.50,
    sellPrice: 22.00,
    supplier: 'Norm Cıvata',
    status: 'Aktif',
    description: 'Galvanizli imbus vida paketi',
    specifications: {
      diameter: 'M8',
      length: '50mm',
      material: 'Çelik',
      coating: 'Galvaniz'
    }
  },
  {
    code: 'HRD-002',
    name: 'Somun M8 (100 adet)',
    type: 'Somun',
    category: 'cat-005',
    unit: 'Paket',
    stock: 95,
    reorderPoint: 20,
    costPrice: 8.75,
    sellPrice: 15.50,
    supplier: 'Norm Cıvata',
    status: 'Aktif',
    description: 'Galvanizli altı köşe somun',
    specifications: {
      thread: 'M8',
      type: 'Altı köşe',
      material: 'Çelik',
      coating: 'Galvaniz'
    }
  },

  // Düşük Stok Örnekleri
  {
    code: 'ELK-004',
    name: 'Sigorta 16A (10 adet)',
    type: 'Koruma',
    category: 'cat-001',
    unit: 'Paket',
    stock: 8, // Reorder point altında
    reorderPoint: 10,
    costPrice: 18.50,
    sellPrice: 28.00,
    supplier: 'Schneider Electric',
    status: 'Aktif',
    description: 'Otomatik sigorta 16 amper'
  },
  {
    code: 'SHT-004',
    name: 'Tuvalet Kapağı Menteşesi',
    type: 'Aksesuar',
    category: 'cat-002',
    unit: 'Adet',
    stock: 0, // Stokta yok
    reorderPoint: 5,
    costPrice: 15.00,
    sellPrice: 25.00,
    supplier: 'VitrA',
    status: 'Aktif',
    description: 'Plastik tuvalet kapağı menteşesi'
  }
];

// ================================
// MIGRATION FUNCTIONS
// ================================

class DataMigration {
  
  constructor(config = MIGRATION_CONFIG) {
    this.config = config;
    this.results = {
      categories: { success: 0, failed: 0, errors: [] },
      materials: { success: 0, failed: 0, errors: [] },
      startTime: new Date(),
      endTime: null
    };
  }
  
  // **LOG FUNCTION**
  log(message, level = 'info') {
    if (this.config.logLevel === 'minimal' && level === 'verbose') return;
    
    const timestamp = new Date().toISOString();
    const prefix = this.config.dryRun ? '[DRY RUN] ' : '';
    console.log(`${timestamp} ${prefix}[${level.toUpperCase()}] ${message}`);
  }
  
  // **MIGRATE CATEGORIES**
  async migrateCategories() {
    this.log('Starting categories migration...');
    
    for (const category of DUMMY_CATEGORIES) {
      try {
        this.log(`Migrating category: ${category.name}`, 'verbose');
        
        if (!this.config.dryRun) {
          await CategoriesService.createCategory(category);
        }
        
        this.results.categories.success++;
        this.log(`✓ Category created: ${category.name}`, 'verbose');
        
      } catch (error) {
        this.results.categories.failed++;
        this.results.categories.errors.push({
          category: category.name,
          error: error.message
        });
        this.log(`✗ Failed to create category ${category.name}: ${error.message}`, 'error');
      }
    }
    
    this.log(`Categories migration completed: ${this.results.categories.success} success, ${this.results.categories.failed} failed`);
  }
  
  // **MIGRATE MATERIALS**
  async migrateMaterials() {
    this.log('Starting materials migration...');
    
    // Process in batches
    for (let i = 0; i < DUMMY_MATERIALS.length; i += this.config.batchSize) {
      const batch = DUMMY_MATERIALS.slice(i, i + this.config.batchSize);
      
      this.log(`Processing batch ${Math.floor(i / this.config.batchSize) + 1}/${Math.ceil(DUMMY_MATERIALS.length / this.config.batchSize)}`, 'verbose');
      
      for (const material of batch) {
        try {
          this.log(`Migrating material: ${material.name}`, 'verbose');
          
          // Validate data if enabled
          if (this.config.validateData) {
            const validationErrors = this.validateMaterial(material);
            if (validationErrors.length > 0) {
              throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
            }
          }
          
          if (!this.config.dryRun) {
            await MaterialsService.createMaterial(material, 'migration-script');
          }
          
          this.results.materials.success++;
          this.log(`✓ Material created: ${material.name}`, 'verbose');
          
        } catch (error) {
          this.results.materials.failed++;
          this.results.materials.errors.push({
            material: material.name,
            code: material.code,
            error: error.message
          });
          this.log(`✗ Failed to create material ${material.name}: ${error.message}`, 'error');
        }
      }
      
      // Small delay between batches
      if (i + this.config.batchSize < DUMMY_MATERIALS.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    this.log(`Materials migration completed: ${this.results.materials.success} success, ${this.results.materials.failed} failed`);
  }
  
  // **VALIDATE MATERIAL**
  validateMaterial(material) {
    const errors = [];
    
    // Required fields
    if (!material.code) errors.push('Material code is required');
    if (!material.name) errors.push('Material name is required');
    if (!material.category) errors.push('Category is required');
    if (!material.unit) errors.push('Unit is required');
    
    // Numeric fields
    if (typeof material.stock !== 'number' || material.stock < 0) {
      errors.push('Stock must be a non-negative number');
    }
    if (typeof material.reorderPoint !== 'number' || material.reorderPoint < 0) {
      errors.push('Reorder point must be a non-negative number');
    }
    
    // Price fields
    if (material.costPrice && (typeof material.costPrice !== 'number' || material.costPrice < 0)) {
      errors.push('Cost price must be a non-negative number');
    }
    if (material.sellPrice && (typeof material.sellPrice !== 'number' || material.sellPrice < 0)) {
      errors.push('Sell price must be a non-negative number');
    }
    
    // Code format (simple check)
    if (material.code && !/^[A-Z]{3}-\d{3}$/.test(material.code)) {
      errors.push('Material code should follow XXX-000 format');
    }
    
    return errors;
  }
  
  // **GENERATE MIGRATION REPORT**
  generateReport() {
    this.results.endTime = new Date();
    const duration = (this.results.endTime - this.results.startTime) / 1000;
    
    const report = {
      timestamp: this.results.endTime.toISOString(),
      dryRun: this.config.dryRun,
      duration: `${duration} seconds`,
      summary: {
        categories: this.results.categories,
        materials: this.results.materials,
        totalSuccess: this.results.categories.success + this.results.materials.success,
        totalFailed: this.results.categories.failed + this.results.materials.failed
      },
      errors: [
        ...this.results.categories.errors.map(e => ({ type: 'category', ...e })),
        ...this.results.materials.errors.map(e => ({ type: 'material', ...e }))
      ]
    };
    
    this.log('\n=== MIGRATION REPORT ===');
    this.log(`Migration Type: ${this.config.dryRun ? 'DRY RUN' : 'LIVE'}`);
    this.log(`Duration: ${report.duration}`);
    this.log(`Categories: ${report.summary.categories.success} success, ${report.summary.categories.failed} failed`);
    this.log(`Materials: ${report.summary.materials.success} success, ${report.summary.materials.failed} failed`);
    this.log(`Total: ${report.summary.totalSuccess} success, ${report.summary.totalFailed} failed`);
    
    if (report.errors.length > 0) {
      this.log('\n=== ERRORS ===');
      report.errors.forEach(error => {
        this.log(`${error.type}: ${error.category || error.material} - ${error.error}`);
      });
    }
    
    this.log('========================\n');
    
    return report;
  }
  
  // **RUN MIGRATION**
  async run() {
    try {
      this.log(`Starting data migration (${this.config.dryRun ? 'DRY RUN' : 'LIVE MODE'})...`);
      this.log(`Config: ${JSON.stringify(this.config, null, 2)}`);
      
      // Migrate categories first
      await this.migrateCategories();
      
      // Small delay before materials
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Migrate materials
      await this.migrateMaterials();
      
      // Generate and return report
      const report = this.generateReport();
      
      this.log('Migration completed successfully!');
      
      return report;
      
    } catch (error) {
      this.log(`Migration failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

// ================================
// MIGRATION UTILITIES
// ================================

// **RUN DRY RUN**
export async function runDryMigration() {
  const migration = new DataMigration({ ...MIGRATION_CONFIG, dryRun: true });
  return await migration.run();
}

// **RUN LIVE MIGRATION**
export async function runLiveMigration() {
  const migration = new DataMigration({ ...MIGRATION_CONFIG, dryRun: false });
  return await migration.run();
}

// **CLEANUP EXISTING DATA** (Dangerous!)
export async function cleanupExistingData() {
  console.warn('⚠️  WARNING: This will delete all existing materials and categories!');
  
  // TODO: Implement cleanup function
  // This should only be used in development environment
  throw new Error('Cleanup function not implemented for safety');
}

// **VERIFY MIGRATION**
export async function verifyMigration() {
  try {
    console.log('Verifying migration results...');
    
    // Check categories
    const categories = await CategoriesService.getCategories();
    console.log(`✓ Found ${categories.length} categories`);
    
    // Check materials
    const materials = await MaterialsService.getMaterials();
    console.log(`✓ Found ${materials.length} materials`);
    
    // Check sample material
    if (materials.length > 0) {
      const sampleMaterial = materials[0];
      console.log(`✓ Sample material: ${sampleMaterial.name} (${sampleMaterial.code})`);
    }
    
    return {
      categoriesCount: categories.length,
      materialsCount: materials.length,
      alertsCount: alerts.length,
      success: true
    };
    
  } catch (error) {
    console.error('Verification failed:', error);
    return {
      error: error.message,
      success: false
    };
  }
}

// **EXPORT FOR DIRECT USAGE**
export { DataMigration, DUMMY_CATEGORIES, DUMMY_MATERIALS };

// ================================
// CLI INTERFACE (Node.js usage)
// ================================

if (typeof process !== 'undefined' && process.argv) {
  const command = process.argv[2];
  
  switch (command) {
    case 'dry-run':
      runDryMigration()
        .then(report => {
          console.log('Dry run completed:', report);
          process.exit(0);
        })
        .catch(error => {
          console.error('Dry run failed:', error);
          process.exit(1);
        });
      break;
      
    case 'migrate':
      runLiveMigration()
        .then(report => {
          console.log('Migration completed:', report);
          process.exit(0);
        })
        .catch(error => {
          console.error('Migration failed:', error);
          process.exit(1);
        });
      break;
      
    case 'verify':
      verifyMigration()
        .then(result => {
          console.log('Verification completed:', result);
          process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
          console.error('Verification failed:', error);
          process.exit(1);
        });
      break;
      
    default:
      console.log(`
Firebase Data Migration Tool

Usage:
  node migrate-data.js [command]

Commands:
  dry-run   Run migration simulation (no actual changes)
  migrate   Run live migration (creates actual data)
  verify    Verify migration results

Examples:
  node migrate-data.js dry-run
  node migrate-data.js migrate
  node migrate-data.js verify
      `);
      break;
  }
}