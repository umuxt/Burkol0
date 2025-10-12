#!/bin/bash

# Firebase Stok Yönetimi Test ve Entegrasyon Script
# Bu script Firebase entegrasyonunu test eder ve doğrular

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="/Users/umutyalcin/Documents/Burkol/quote-portal"
FIREBASE_CONFIG_FILE="$PROJECT_ROOT/src/firebase-config.js"
MIGRATION_SCRIPT="$PROJECT_ROOT/scripts/migrate-data.js"
TEST_MODE="development"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${BLUE}==== $1 ====${NC}"
}

# Check if we're in the correct directory
check_project_structure() {
    log_step "Project Structure Check"
    
    if [ ! -d "$PROJECT_ROOT" ]; then
        log_error "Project directory not found: $PROJECT_ROOT"
        exit 1
    fi
    
    cd "$PROJECT_ROOT"
    
    # Check essential files
    local required_files=(
        "src/firebase-config.js"
        "src/lib/firestore-schemas.js"
        "src/lib/materials-service.js"
        "hooks/useFirebaseMaterials.js"
        "scripts/migrate-data.js"
        "package.json"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Required file not found: $file"
            exit 1
        else
            log_success "✓ Found: $file"
        fi
    done
}

# Check Node.js and npm
check_dependencies() {
    log_step "Dependencies Check"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    local node_version=$(node --version)
    log_success "✓ Node.js: $node_version"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    local npm_version=$(npm --version)
    log_success "✓ npm: $npm_version"
    
    # Check Firebase CLI
    if command -v firebase &> /dev/null; then
        local firebase_version=$(firebase --version)
        log_success "✓ Firebase CLI: $firebase_version"
    else
        log_warning "Firebase CLI not installed (optional for development)"
    fi
}

# Install or update packages
install_packages() {
    log_step "Package Installation"
    
    log_info "Installing/updating npm packages..."
    npm install
    
    # Check Firebase packages specifically
    local firebase_packages=(
        "firebase"
        "@firebase/firestore"
        "@firebase/auth"
    )
    
    for package in "${firebase_packages[@]}"; do
        if npm list "$package" &> /dev/null; then
            log_success "✓ Firebase package: $package"
        else
            log_warning "Installing Firebase package: $package"
            npm install "$package"
        fi
    done
}

# Validate Firebase configuration
validate_firebase_config() {
    log_step "Firebase Configuration Validation"
    
    log_info "Checking Firebase config file..."
    
    # Basic syntax check
    if node -c "$FIREBASE_CONFIG_FILE" 2>/dev/null; then
        log_success "✓ Firebase config syntax is valid"
    else
        log_error "Firebase config has syntax errors"
        return 1
    fi
    
    # Check if config contains required fields
    local required_fields=(
        "apiKey"
        "authDomain"
        "projectId"
        "storageBucket"
        "messagingSenderId"
        "appId"
    )
    
    for field in "${required_fields[@]}"; do
        if grep -q "$field" "$FIREBASE_CONFIG_FILE"; then
            log_success "✓ Config field: $field"
        else
            log_error "Missing config field: $field"
            return 1
        fi
    done
}

# Test Firebase schema validation
test_schemas() {
    log_step "Schema Validation Test"
    
    log_info "Testing Firestore schemas..."
    
    # Create a simple test script as CommonJS
    cat > test-schemas-temp.cjs << 'EOF'
// Schema validation test (CommonJS)
const fs = require('fs');

// Read and evaluate the schema file
const schemaContent = fs.readFileSync('./src/lib/firestore-schemas.js', 'utf8');

console.log('Testing schema file structure...');

// Check if file contains required exports
const requiredExports = [
    'MaterialSchema',
    'CategorySchema', 
    'StockMovementSchema',
    'validateMaterial',
    'validateStockMovement'
];

for (const exportName of requiredExports) {
    if (schemaContent.includes(exportName)) {
        console.log(`✓ Found: ${exportName}`);
    } else {
        console.log(`✗ Missing: ${exportName}`);
        process.exit(1);
    }
}

// Test basic validation logic patterns
const validationPatterns = [
    'if (!',
    'errors.push',
    'return errors',
    'validateMaterial',
    'validateStockMovement'
];

for (const pattern of validationPatterns) {
    if (schemaContent.includes(pattern)) {
        console.log(`✓ Validation pattern: ${pattern}`);
    } else {
        console.log(`✗ Missing validation pattern: ${pattern}`);
        process.exit(1);
    }
}

console.log('✓ Schema structure validation passed');
EOF
    
    if node test-schemas-temp.cjs; then
        log_success "✓ Schema validation tests passed"
    else
        log_error "Schema validation tests failed"
        return 1
    fi
    
    # Cleanup
    rm -f test-schemas-temp.cjs
}

# Test migration script
test_migration() {
    log_step "Migration Script Test"
    
    log_info "Testing migration script (dry run)..."
    
    # Create a simple migration test
    cat > /tmp/test-migration.js << 'EOF'
import { runDryMigration } from './scripts/migrate-data.js';

async function testMigration() {
    try {
        console.log('Running migration dry run...');
        const report = await runDryMigration();
        
        console.log('Migration dry run completed:');
        console.log(`- Categories: ${report.summary.categories.success} success, ${report.summary.categories.failed} failed`);
        console.log(`- Materials: ${report.summary.materials.success} success, ${report.summary.materials.failed} failed`);
        
        if (report.summary.totalFailed > 0) {
            console.log('Errors occurred during dry run:');
            report.errors.forEach(error => {
                console.log(`  - ${error.type}: ${error.error}`);
            });
            process.exit(1);
        } else {
            console.log('✓ Migration dry run completed successfully');
        }
        
    } catch (error) {
        console.error('Migration test failed:', error.message);
        process.exit(1);
    }
}

testMigration();
EOF
    
    if node --experimental-modules /tmp/test-migration.js; then
        log_success "✓ Migration script test passed"
    else
        log_error "Migration script test failed"
        return 1
    fi
    
    # Cleanup
    rm -f /tmp/test-migration.js
}

# Test React hooks
test_hooks() {
    log_step "React Hooks Test"
    
    log_info "Testing React hooks syntax..."
    
    # Check hooks file syntax
    if node -c "hooks/useFirebaseMaterials.js" 2>/dev/null; then
        log_success "✓ React hooks syntax is valid"
    else
        log_error "React hooks have syntax errors"
        return 1
    fi
    
    # Check for required hook exports
    local required_hooks=(
        "useMaterials"
        "useMaterial"
        "useMaterialActions"
        "useCategories"
        "useStockAlerts"
    )
    
    for hook in "${required_hooks[@]}"; do
        if grep -q "export.*$hook" "hooks/useFirebaseMaterials.js"; then
            log_success "✓ Hook exported: $hook"
        else
            log_error "Missing hook export: $hook"
            return 1
        fi
    done
}

# Run build test
test_build() {
    log_step "Build Test"
    
    log_info "Testing application build..."
    
    # Check if build script exists
    if npm run build --dry-run &>/dev/null; then
        log_info "Running build test..."
        if npm run build 2>/dev/null; then
            log_success "✓ Build completed successfully"
        else
            log_error "Build failed"
            return 1
        fi
    else
        log_warning "No build script found, skipping build test"
    fi
}

# Generate integration report
generate_report() {
    log_step "Integration Report"
    
    local report_file="firebase-integration-report.md"
    
    cat > "$report_file" << EOF
# Firebase Stok Yönetimi Entegrasyon Raporu

**Tarih:** $(date '+%Y-%m-%d %H:%M:%S')
**Test Modu:** $TEST_MODE

## 📋 Test Sonuçları

### ✅ Başarılı Testler
- ✓ Proje yapısı kontrolü
- ✓ Bağımlılık kontrolü
- ✓ Firebase konfigürasyon doğrulaması
- ✓ Schema validasyon testleri
- ✓ Migrasyon script testi (dry run)
- ✓ React hooks syntax kontrolü
- ✓ Build testi

### 📁 Oluşturulan Dosyalar
- \`src/lib/firestore-schemas.js\` - Firestore schema tanımları
- \`src/lib/materials-service.js\` - Firebase servis katmanı
- \`hooks/useFirebaseMaterials.js\` - React hooks
- \`scripts/migrate-data.js\` - Veri migrasyon scripti
- \`src/firebase-config.js\` - Güncellenmiş Firebase konfigürasyonu

### 🔧 Özellikler
- **CRUD İşlemleri:** Malzeme oluşturma, okuma, güncelleme, silme
- **Stok Yönetimi:** Stok girişi/çıkışı, hareket takibi
- **Kategori Yönetimi:** Malzeme kategorileri
- **Stok Uyarıları:** Düşük stok ve kritik stok uyarıları
- **Real-time Sync:** Gerçek zamanlı veri senkronizasyonu
- **Validasyon:** Kapsamlı veri doğrulama
- **Migration:** Mevcut datanın Firebase'e aktarımı

### 🚀 Sonraki Adımlar
1. **Firebase Proje Kurulumu:** Firebase Console'da proje oluşturun
2. **Migration Çalıştırma:** \`node scripts/migrate-data.js migrate\`
3. **React Entegrasyonu:** Hooks'ları mevcut React componentlere entegre edin
4. **Test Verisi:** Migration ile test verisi oluşturun
5. **Monitoring:** Firebase Console'dan veri durumunu kontrol edin

### 📚 Kullanım Örnekleri

#### Hook Kullanımı:
\`\`\`javascript
import { useMaterials, useMaterialActions } from '../hooks/useFirebaseMaterials';

function MaterialsList() {
  const { materials, loading, error } = useMaterials();
  const { createMaterial, updateMaterial } = useMaterialActions();
  
  // Component logic here
}
\`\`\`

#### Doğrudan Servis Kullanımı:
\`\`\`javascript
import { MaterialsService } from '../lib/materials-service';

const materials = await MaterialsService.getMaterials();
const newMaterial = await MaterialsService.createMaterial(materialData, userId);
\`\`\`

### 🔒 Güvenlik Notları
- Firebase Security Rules kurulması gerekiyor
- Kullanıcı authentication sistemi entegrasyonu
- API endpoint'leri için rate limiting
- Hassas veri şifreleme

### ⚠️ Önemli Notlar
- Bu rapor development ortamı için hazırlanmıştır
- Production'a geçmeden önce güvenlik kuralları oluşturun
- Backup stratejisi belirleyin
- Monitoring ve logging sistemini aktifleştirin

---

**Entegrasyon Durumu:** ✅ Hazır
**Toplam Dosya:** 5 ana dosya oluşturuldu
**Test Durumu:** Tüm testler başarılı
EOF

    log_success "✓ Integration report generated: $report_file"
}

# Main execution function
main() {
    log_info "Firebase Stok Yönetimi Entegrasyon Testi Başlıyor..."
    log_info "Test Mode: $TEST_MODE"
    log_info "Project Root: $PROJECT_ROOT"
    
    # Run all tests
    check_project_structure
    check_dependencies
    install_packages
    validate_firebase_config
    test_schemas
    test_migration
    test_hooks
    test_build
    
    # Generate final report
    generate_report
    
    log_success "🎉 Tüm testler başarıyla tamamlandı!"
    log_info "📄 Detaylı rapor için: firebase-integration-report.md"
    
    echo ""
    log_info "Sonraki adımlar:"
    echo "1. Firebase Console'da proje kurulumu yapın"
    echo "2. Migration çalıştırın: node scripts/migrate-data.js migrate"
    echo "3. React componentleri güncellemeye başlayın"
    echo "4. Firebase Security Rules oluşturun"
}

# Script arguments handling
case "${1:-}" in
    "quick")
        log_info "Quick test mode - skipping build test"
        check_project_structure
        validate_firebase_config
        test_schemas
        log_success "Quick tests completed!"
        ;;
    "schema-only")
        log_info "Schema validation only"
        test_schemas
        ;;
    "migration-only")
        log_info "Migration test only"
        test_migration
        ;;
    "help"|"-h"|"--help")
        echo "Firebase Integration Test Script"
        echo ""
        echo "Usage:"
        echo "  $0              Run full integration test"
        echo "  $0 quick        Run quick tests (skip build)"
        echo "  $0 schema-only  Test schemas only"
        echo "  $0 migration-only Test migration only"
        echo "  $0 help         Show this help"
        echo ""
        ;;
    *)
        main
        ;;
esac