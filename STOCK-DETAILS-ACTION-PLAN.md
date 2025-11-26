# Stok Detayları Görünüm İyileştirme Aksiyon Planı

Bu belge, malzeme detaylarındaki "Üretim Geçmişi" tablosunda, tamamlanmış iş emirleri için WIP (Hazırlık) ve Ayarlama kayıtlarının birleştirilerek tek bir "Sarf" (Tüketim) kaydı olarak gösterilmesi için gerekli adımları içerir.

## 1. Hedef
Mevcut durumda, bir iş emri tamamlandığında tabloda iki satır oluşmaktadır:
1. **WIP:** İşe başlandığında düşülen tahmini miktar (örn: -100m).
2. **Ayarlama:** İş bitiminde yapılan düzeltme (örn: +2m veya -5m).

**İstenilen Durum:**
*   Eğer iş devam ediyorsa: Sadece **WIP** satırı gösterilecek.
*   Eğer iş tamamlanmışsa (Ayarlama kaydı varsa): WIP ve Ayarlama satırları gizlenecek, bunların toplamı **Sarf** (Gerçek Tüketim) olarak tek satırda gösterilecek.

## 2. Teknik Analiz
İlgili dosya: `quote-portal/domains/materials/hooks/useMaterialProductionHistory.js`

Veriler şu anda `/api/stockMovements` üzerinden ham olarak çekilmekte ve `map` fonksiyonu ile birebir tablo satırına dönüştürülmektedir. Yapılması gereken, bu `map` işlemi yerine verileri `assignmentId` (Atama ID) bazında gruplayarak işlemektir.

## 3. Uygulama Adımları

### Adım 1: Veri Gruplama ve Dönüştürme Mantığı (`useMaterialProductionHistory.js`)
`useMaterialProductionHistory` hook'u içerisinde veri işleme mantığı şu şekilde güncellenecektir:

1.  Ham veriler (`movements`) çekildikten sonra, `assignmentId` değerine göre gruplandırılacak.
2.  Her grup için kontrol yapılacak:
    *   Grupta hem `wip_reservation` hem de `adjustment` kayıtları var mı?
    *   Yoksa sadece `wip_reservation` mı var?
3.  **Senaryo A (İş Tamamlanmış):** Grupta `adjustment` varsa:
    *   WIP miktarını ve Ayarlama miktarını topla (örn: -100 + 2 = -98).
    *   Türü `realized_consumption` (Gerçekleşen Sarf) olarak yeni bir kayıt oluştur.
    *   Tarih olarak `adjustment` kaydının tarihini (bitiş zamanı) kullan.
4.  **Senaryo B (İş Devam Ediyor):** Grupta sadece `wip_reservation` varsa:
    *   Mevcut `wip` kaydını olduğu gibi göster.
5.  **Senaryo C (Diğer):** Scrap (Fire) veya diğer kayıtlar olduğu gibi bırakılacak.

### Adım 2: Arayüz Güncellemesi (`MaterialDetailsPanel.jsx`)
`quote-portal/domains/materials/components/MaterialDetailsPanel.jsx` dosyasında yeni oluşturulan `realized_consumption` türü için görsel düzenleme yapılacak.

1.  `switch (item.type)` bloğuna `realized_consumption` case'i eklenecek.
2.  Görünüm:
    *   **Etiket:** "Sarf"
    *   **Renk:** Nötr veya koyu gri/lacivert tonlarında (WIP veya Ayarlama gibi dikkat çekici renkler yerine kalıcı stok hareketi rengi).
    *   **İkon:** Tüketim ikonu.

## 4. Örnek Veri Dönüşümü

**Mevcut Ham Veri:**
| Tarih | Tip | Miktar | ID |
|-------|-----|--------|----|
| 18:16 | adjustment | +2m | 102 |
| 18:15 | wip_reservation | -100m | 101 |

**Dönüştürülmüş Veri (Frontend):**
| Tarih | Tip | Miktar | Not |
|-------|-----|--------|-----|
| 18:16 | realized_consumption | -98m | Tamamlandı |

## 5. Sonraki Adım
Onaylamanız durumunda, `useMaterialProductionHistory.js` dosyasındaki veri işleme mantığını yukarıdaki plana göre yeniden kodlayacağım.
