# Firebase Session Management System

## Yeni Session Yapısı

Firebase'de tutulan session bilgileri aşağıdaki yapıya göre güncellenmiştir:

### Session Veri Yapısı

```json
{
  "sessionId": "ss-20251005-0001",
  "token": "base64url-encoded-token",
  "userName": "Admin User",
  "email": "admin@burkol.com", 
  "loginTime": "2025-10-05T10:30:15.123Z",
  "loginDate": "2025-10-05",
  "expires": "2025-11-04T10:30:15.123Z",
  "lastActivityAt": "2025-10-05T11:45:02.341Z",
  "activityLog": [
    {
      "id": "act-lt4h2x8a",
      "timestamp": "2025-10-05T10:30:15.456Z",
      "type": "session",
      "action": "login",
      "scope": "auth",
      "title": "Admin panel giriş yapıldı",
      "description": "admin@burkol.com oturumu başlatıldı",
      "performedBy": {
        "email": "admin@burkol.com",
        "userName": "Admin User",
        "sessionId": "ss-20251005-0001"
      },
      "metadata": {
        "expires": "2025-11-04T10:30:15.123Z"
      }
    },
    {
      "id": "act-m02k49ph",
      "timestamp": "2025-10-05T11:12:08.902Z",
      "type": "price-settings",
      "action": "update",
      "scope": "pricing",
      "title": "Fiyat ayarları güncellendi (v42)",
      "description": "2 parametre eklendi, 1 parametre güncellendi, 18 teklif yeniden değerlendirilecek",
      "performedBy": {
        "email": "admin@burkol.com",
        "userName": "Admin User",
        "sessionId": "ss-20251005-0001"
      },
      "metadata": {
        "version": 42,
        "versionId": "adm-20251005-03",
        "affectedQuotes": 18
      }
    }
  ]
}
```

### Session ID Formatı

Session ID'ler aşağıdaki algoritma ile oluşturulur:

```
ss-yyyymmdd-000x
```

- `ss`: Sabit iki harf prefix
- `yyyy`: Yıl (4 basamak)
- `mm`: Ay (2 basamak, başında sıfır) - 01, 06, 09, 11
- `dd`: Gün (2 basamak, başında sıfır) - 01, 15, 29
- `000x`: O gün içindeki kaçıncı giriş olduğu (4 basamak max)
  - 1 basamaklı: 0001, 0005
  - 2 basamaklı: 0010, 0025  
  - 3 basamaklı: 0134, 0256
  - 4 basamaklı: 1409, 9999

### Activity Log Yapısı

Her session artık sistemde gerçekleştirilen kritik aksiyonların izlenebilmesi için `activityLog` alanını barındırır. Bu alan aşağıdaki bilgileri içerir:

- `id`: Otomatik üretilmiş benzersiz aktivite kimliği
- `timestamp`: Aktivitenin gerçekleştiği ISO tarih/zaman damgası
- `type`: Aktivitenin türü (`session`, `price-settings`, `form-config` vb.)
- `action`: Yapılan işlemin kısa adı (`login`, `update`, `restore` vb.)
- `scope`: Etkilenen ana modül (`auth`, `pricing`, `forms` vb.)
- `title`: Kullanıcı arayüzü için özet başlık
- `description`: Yapılan değişikliğe dair detaylı bilgi (opsiyonel)
- `performedBy`: İşlemi yapan kullanıcı ve session bilgisi
- `metadata`: İsteğe bağlı olarak saklanan ham veri (örneğin etkilenen teklif sayısı, versiyon numarası vb.)

### Örnekler

- `ss-20251005-0001`: 5 Ekim 2025'te günün ilk girişi
- `ss-20251005-0015`: 5 Ekim 2025'te günün 15. girişi
- `ss-20251225-1234`: 25 Aralık 2025'te günün 1234. girişi

## API Endpoints

### Session Yönetimi

#### Giriş Yapma
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@burkol.com",
  "password": "password123"
}

Response:
{
  "token": "base64url-token",
  "user": { "email": "admin@burkol.com", "role": "admin" },
  "session": {
    "sessionId": "ss-20251005-0001",
    "loginTime": "2025-10-05T10:30:15.123Z",
    "loginDate": "2025-10-05",
    "expires": "2025-11-04T10:30:15.123Z"
  }
}
```

#### Mevcut Kullanıcı Bilgisi
```
GET /api/auth/me
Authorization: Bearer <token>

Response:
{
  "email": "admin@burkol.com",
  "role": "admin", 
  "name": "Admin User",
  "sessionId": "ss-20251005-0001",
  "loginTime": "2025-10-05T10:30:15.123Z",
  "loginDate": "2025-10-05"
}
```

#### Tüm Session'ları Listele (Admin)
```
GET /api/admin/sessions
Authorization: Bearer <token>

Response:
{
  "sessions": [
    {
      "sessionId": "ss-20251005-0001",
      "token": "token1",
      "userName": "Admin User",
      "email": "admin@burkol.com",
      "loginTime": "2025-10-05T10:30:15.123Z",
      "loginDate": "2025-10-05", 
      "expires": "2025-11-04T10:30:15.123Z"
    }
  ]
}
```

#### Session Silme (Admin)
```
DELETE /api/admin/sessions/:sessionId
Authorization: Bearer <token>

Response:
{
  "message": "Session deleted successfully"
}
```

## Migration

Mevcut session'ları yeni formata dönüştürmek için:

```bash
# Migration script'ini çalıştır
node scripts/migrate-sessions.js

# Test script'ini çalıştır
node scripts/test-session-system.js
```

## Veritabanı Değişiklikleri

### Firebase Collections

#### sessions
- Document ID: `sessionId` (ss-yyyymmdd-000x formatında)
- Eskiden: Document ID token idi
- Yeni: Document ID sessionId, token field olarak saklanıyor

#### system/config
Günlük session sayaçları saklanıyor:
```json
{
  "dailySessionCounters": {
    "20251005": 15,
    "20251004": 8,
    "20251003": 12
  }
}
```

### Eski ve Yeni Format Karşılaştırması

#### Eski Format
```json
{
  "token": "base64url-token",
  "email": "admin@burkol.com",
  "expires": "2025-11-04T10:30:15.123Z"
}
```

#### Yeni Format
```json
{
  "sessionId": "ss-20251005-0001",
  "token": "base64url-token", 
  "userName": "Admin User",
  "email": "admin@burkol.com",
  "loginTime": "2025-10-05T10:30:15.123Z",
  "loginDate": "2025-10-05",
  "expires": "2025-11-04T10:30:15.123Z"
}
```

## Kod Değişiklikleri

### Yeni Fonksiyonlar

- `generateSessionId()`: Session ID oluşturur
- `getSessionById(sessionId)`: Session ID ile session bulur
- `getAllSessions()`: Tüm session'ları listeler  
- `deleteSessionById(sessionId)`: Session ID ile session siler

### Güncellenmiş Fonksiyonlar

- `createSession(email, days)`: Yeni session formatını kullanır
- `putSession(session)`: sessionId zorunlu, Firestore'da sessionId ile saklar
- `deleteSession(token)`: sessionId ile Firestore'dan siler

## Test

```bash
# Yeni session sistemini test et
node scripts/test-session-system.js

# Migration test et
node scripts/migrate-sessions.js
```

Test script'i şunları test eder:
1. Session ID generation
2. User creation
3. Session creation
4. Session listing
5. Session lookup by ID
6. Session deletion by ID
7. Daily counter management
