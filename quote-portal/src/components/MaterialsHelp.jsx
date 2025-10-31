import React, { useEffect, useState, useCallback } from 'react'

export default function MaterialsHelp() {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('stocks')

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close()
    }
    if (isOpen) {
      document.addEventListener('keydown', onKeyDown)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = 'auto'
    }
  }, [isOpen, close])

  return (
    <>
      <button className="help-button" title="Help & Guide" onClick={open}>
        ?
      </button>

      <div
        className={`help-overlay${isOpen ? ' active' : ''}`}
        onClick={close}
        role="presentation"
      />

      <div className={`help-panel${isOpen ? ' active' : ''}`} role="dialog" aria-modal="true" aria-labelledby="materials-help-title">
        <div className="help-header">
          <div>
            <h2 id="materials-help-title" className="help-title">📦 Materials Yardım</h2>
            <p className="help-subtitle">Stoklar, Tedarikçiler ve Siparişler için hızlı rehber</p>
          </div>
          <button className="help-close" onClick={close} aria-label="Kapat">×</button>
        </div>

        <div className="help-content">
          <div className="help-tabs" role="tablist">
            <button
              className={`help-tab${activeTab === 'stocks' ? ' active' : ''}`}
              onClick={() => setActiveTab('stocks')}
              role="tab"
              aria-selected={activeTab === 'stocks'}
            >📦 Stoklar</button>
            <button
              className={`help-tab${activeTab === 'suppliers' ? ' active' : ''}`}
              onClick={() => setActiveTab('suppliers')}
              role="tab"
              aria-selected={activeTab === 'suppliers'}
            >🤝 Tedarikçiler</button>
            <button
              className={`help-tab${activeTab === 'orders' ? ' active' : ''}`}
              onClick={() => setActiveTab('orders')}
              role="tab"
              aria-selected={activeTab === 'orders'}
            >🧾 Siparişler</button>
          </div>

          {/* Stocks */}
          <div className={`help-section${activeTab === 'stocks' ? ' active' : ''}`} id="help-stocks">
            <div className="help-step">
              <div className="help-step-header">
                <div className="help-step-number">1</div>
                <h3 className="help-step-title">Filtreler ve Arama</h3>
              </div>
              <p className="help-step-description">Arama kutusu, kategori ve tip filtreleri ile istediğiniz malzemeyi hızla bulun.</p>
              <div className="help-step-details">
                <ul>
                  <li><strong>Arama:</strong> Kod, ad ve kategoriye göre arar</li>
                  <li><strong>Kategoriler:</strong> Çoklu seçim ile daraltın</li>
                  <li><strong>Tip:</strong> Ham Madde / Yarı Mamul / Bitmiş Ürün</li>
                  <li><strong>Düşük Stok:</strong> Emniyet stok altındakileri vurgular</li>
                </ul>
              </div>
            </div>

            <div className="help-step">
              <div className="help-step-header">
                <div className="help-step-number">2</div>
                <h3 className="help-step-title">Malzeme İşlemleri</h3>
              </div>
              <p className="help-step-description">Yeni malzeme ekleyin, mevcutları düzenleyin veya kaldırın.</p>
              <div className="help-step-details">
                <ul>
                  <li><strong>Ekle:</strong> Sağ üstteki “Yeni Malzeme”</li>
                  <li><strong>Düzenle:</strong> Satırdaki üç nokta menüsü</li>
                  <li><strong>Sil/Kaldır:</strong> Yumuşak silme ile kayıtlar korunur</li>
                  <li><strong>Kategori Yönetimi:</strong> Kategorileri oluştur, yeniden adlandır, sil</li>
                </ul>
              </div>
              <button className="help-action-button" onClick={close}>Anladım</button>
            </div>
          </div>

          {/* Suppliers */}
          <div className={`help-section${activeTab === 'suppliers' ? ' active' : ''}`} id="help-suppliers">
            <div className="help-step">
              <div className="help-step-header">
                <div className="help-step-number">1</div>
                <h3 className="help-step-title">Tedarikçi Yönetimi</h3>
              </div>
              <p className="help-step-description">Tedarikçileri görüntüleyin, malzeme ilişkilendirin ve detayları yönetin.</p>
              <div className="help-step-details">
                <ul>
                  <li><strong>Detay Aç:</strong> Satırdan tedarikçi detayını görüntüleyin</li>
                  <li><strong>Malzeme İlişkisi:</strong> Yeni oluşturulan malzemeleri tedarikçiye bağlayın</li>
                  <li><strong>Fiyat/Min. Miktar:</strong> Satın alma parametrelerini kaydedin</li>
                  <li><strong>Kısayol:</strong> Bazı yerlerden `materials.html#suppliers-tab` ile doğrudan açılır</li>
                </ul>
              </div>
            </div>

            <div className="help-step">
              <div className="help-step-header">
                <div className="help-step-number">2</div>
                <h3 className="help-step-title">Hızlı Navigasyon</h3>
              </div>
              <p className="help-step-description">Sekmeler arasında geçişte seçimleriniz korunur.</p>
              <div className="help-step-details">
                <ul>
                  <li><strong>Yer İmleri:</strong> URL hash ile belirli tedarikçiye yönlendirme</li>
                  <li><strong>Filtreler:</strong> Sekme değiştirince de kalır</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Orders */}
          <div className={`help-section${activeTab === 'orders' ? ' active' : ''}`} id="help-orders">
            <div className="help-step">
              <div className="help-step-header">
                <div className="help-step-number">1</div>
                <h3 className="help-step-title">Siparişler Sekmesi</h3>
              </div>
              <p className="help-step-description">Malzeme talepleri ve tedarik siparişlerinizi burada yönetin.</p>
              <div className="help-step-details">
                <ul>
                  <li><strong>Durumlar:</strong> Taslak, Beklemede, Verildi, Teslimde</li>
                  <li><strong>Tedarikçi Bağı:</strong> İlgili tedarikçi ve malzemeye bağlanır</li>
                  <li><strong>Güncellemeler:</strong> Teslimat, fiyat ve termin takip</li>
                  <li><strong>Kısayol:</strong> `materials.html#orders-tab` ile doğrudan erişim</li>
                </ul>
              </div>
              <button className="help-action-button" onClick={close}>Tamam</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

