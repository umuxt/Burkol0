# 📁 TESTING SUITE - Burkol Quote Portal Test Dosyaları

## 📋 Klasör Yapısı

### 🔒 Security Tests (`/security/`)
Güvenlik testleri ve penetration testing scriptleri

- **`advanced-penetration-test.sh`** - Kapsamlı güvenlik testi
  - Price overflow attacks
  - Formula injection tests  
  - Input validation bypass tests
  - XSS prevention tests

- **`focused-vulnerability-test.sh`** - Hedefli vulnerability tarama
  - Specific attack vectors
  - Business logic flaws
  - Authentication bypass attempts

- **`system-compatibility-test.sh`** - Sistem uyumluluk testi
  - Backward compatibility
  - API consistency checks
  - Error handling validation

### 🏗️ Dynamic System Tests (`/dynamic-system/`)
Dinamik sistem mimarisi doğrulama testleri

- **`dynamic-system-test.sh`** - Temel dinamik sistem testi
  - Database integration validation
  - Parameter ID mapping tests
  - Formula processing verification

- **`admin-parameter-test.sh`** - Admin parametre yönetimi testi
  - Admin authentication
  - Parameter modification tests
  - Real-time update validation

- **`database-direct-test.sh`** - Database direkt erişim testi
  - Direct database manipulation
  - jsondb.js function testing
  - Data persistence validation

- **`final-dynamic-proof-test.sh`** - Final dinamik sistem kanıt testi
  - Comprehensive dynamic validation
  - Performance testing
  - System consistency proof

### 📊 Reports (`/reports/`)
Test sonuçları ve raporlar

- **`ADVANCED-SECURITY-DYNAMIC-VALIDATION-REPORT.md`** - Ana test raporu
  - Executive summary
  - Security findings
  - Dynamic system validation
  - Performance metrics
  - Recommendations

## 🚀 Kullanım Talimatları

### Security Tests Çalıştırma:
```bash
cd /Users/umutyalcin/Documents/Burkol/testing/security
./advanced-penetration-test.sh
./focused-vulnerability-test.sh
./system-compatibility-test.sh
```

### Dynamic System Tests Çalıştırma:
```bash
cd /Users/umutyalcin/Documents/Burkol/testing/dynamic-system
./dynamic-system-test.sh
./admin-parameter-test.sh
./final-dynamic-proof-test.sh
```

### Tüm Testleri Çalıştırma:
```bash
cd /Users/umutyalcin/Documents/Burkol/testing
find . -name "*.sh" -type f -exec chmod +x {} \;
find . -name "*.sh" -type f -exec {} \;
```

## ⚠️ Ön Koşullar

1. **Server Running**: Quote Portal server'ının port 3002'de çalışıyor olması
2. **Database Connection**: Firestore bağlantısının aktif olması
3. **Dependencies**: curl, jq, bc gibi tools'ların yüklü olması

## 📈 Test Kategorileri

### 🔐 Security Categories:
- **Input Validation**: XSS, injection prevention
- **Business Logic**: Price manipulation attacks
- **Authentication**: Admin access controls
- **Rate Limiting**: DDoS protection

### 🏗️ Dynamic System Categories:
- **Database Integration**: Firestore connectivity
- **Parameter Management**: Admin configuration
- **Real-time Updates**: Live parameter changes
- **Performance**: Response time validation

## 🔄 Maintenance

### Test Files Update:
- Security tests: Yeni attack vectors keşfedildikçe güncellenecek
- Dynamic tests: Sistem feature'ları eklendikçe genişletilecek
- Reports: Her major test cycle'da güncellenecek

### Automation:
Bu testler CI/CD pipeline'a entegre edilebilir:
```yaml
# .github/workflows/security-tests.yml örneği
- name: Run Security Tests
  run: |
    cd testing/security
    ./advanced-penetration-test.sh
```

---

**Oluşturulma Tarihi:** 25 Eylül 2025  
**Versiyonu:** 1.0  
**Son Güncelleme:** 25 Eylül 2025