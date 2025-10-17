import React, { useState, useEffect } from 'react'

const MaterialDeletionWarningModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  materials, // Array of materials to delete
  isBulk = false,
  suppliers = [] // Array of all suppliers for checking relationships
}) => {
  const [affectedSuppliers, setAffectedSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [confirmChecked, setConfirmChecked] = useState(false)

  useEffect(() => {
    if (isOpen && materials && materials.length > 0) {
      calculateAffectedSuppliers()
    }
  }, [isOpen, materials, suppliers])

  const calculateAffectedSuppliers = () => {
    setLoading(true)
    const materialIds = materials.map(m => m.id)
    const affected = []

    suppliers.forEach(supplier => {
      if (supplier.suppliedMaterials) {
        const suppliedMaterials = supplier.suppliedMaterials.filter(sm => 
          materialIds.includes(sm.id)
        )
        
        if (suppliedMaterials.length > 0) {
          affected.push({
            supplier: supplier,
            materials: suppliedMaterials,
            materialCount: suppliedMaterials.length
          })
        }
      }
    })

    setAffectedSuppliers(affected)
    setLoading(false)
  }

  const handleConfirm = () => {
    if (!confirmChecked) return
    onConfirm()
    handleClose()
  }

  const handleClose = () => {
    setConfirmChecked(false)
    setAffectedSuppliers([])
    onClose()
  }

  if (!isOpen) {
    console.log('🚫 MaterialDeletionWarningModal: isOpen =', isOpen);
    return null;
  }
  
  console.log('✅ MaterialDeletionWarningModal: Rendering modal', { 
    materialsCount: materials?.length, 
    suppliersCount: suppliers?.length,
    isBulk 
  });

  const totalMaterials = materials.length
  const totalAffectedSuppliers = affectedSuppliers.length
  const totalAffectedMaterials = affectedSuppliers.reduce((sum, item) => sum + item.materialCount, 0)

  return (
    <div className="modal-overlay">
      <div className="deletion-warning-modal">
        <div className="modal-header warning-header">
          <div className="warning-title">
            <span className="warning-icon">⚠️</span>
            <h3>Malzeme {isBulk ? 'Kaldırma' : 'Kaldırma'} Uyarısı</h3>
          </div>
          <button 
            className="modal-close-btn" 
            onClick={handleClose}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        <div className="modal-content">
          <div className="warning-summary">
            <div className="warning-message">
              <strong>
                {isBulk 
                  ? `${totalMaterials} malzemeyi kaldırmak üzeresiniz.`
                  : `"${materials[0]?.name}" malzemesini kaldırmak üzeresiniz.`
                }
              </strong>
            </div>
            
            {loading ? (
              <div className="loading-section">
                <div className="spinner"></div>
                <p>Tedarikçi ilişkileri kontrol ediliyor...</p>
              </div>
            ) : totalAffectedSuppliers > 0 ? (
              <div className="supplier-impact">
                <p className="impact-summary">
                  Bu malzeme{isBulk && totalMaterials > 1 ? 'ler' : ''} <strong>{totalAffectedSuppliers} tedarikçi</strong> tarafından tedarik edilmektedir.
                </p>
                <div className="affected-suppliers">
                  <h4>📋 Etkilenen Tedarikçiler:</h4>
                  <div className="suppliers-list">
                    {affectedSuppliers.map((item, index) => (
                      <div key={index} className="supplier-item">
                        <div className="supplier-info">
                          <span className="supplier-name">• {item.supplier.name}</span>
                          <span className="material-count">
                            ({item.materialCount} malzeme)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-suppliers">
                <p className="no-impact">
                  ✅ Bu malzeme{isBulk && totalMaterials > 1 ? 'ler' : ''} henüz hiçbir tedarikçi tarafından tedarik edilmiyor.
                </p>
              </div>
            )}
          </div>

          <div className="consequences-section">
            <h4>🚫 Kaldırılan malzemelerle ilgili sınırlamalar:</h4>
            <ul className="consequences-list">
              <li>
                <span className="consequence-icon">🔍</span>
                Tedarikçi detaylarında <strong>"Kaldırılan Malzemeler"</strong> bölümünde görüntülenecek
              </li>
              <li>
                <span className="consequence-icon">🚫</span>
                Yeni sipariş verilemeyecek ve fiyat güncellemeleri yapılamayacak
              </li>
              <li>
                <span className="consequence-icon">📊</span>
                Raporlarda <strong>"kaldırılmış"</strong> olarak işaretlenecek
              </li>
              <li>
                <span className="consequence-icon">🔒</span>
                Stok hareketleri ve güncellemeler durduruluacak
              </li>
              <li>
                <span className="consequence-icon">⚠️</span>
                Mevcut siparişler ve fiyat geçmişi etkilenmeyecek
              </li>
              <li>
                <span className="consequence-icon">♻️</span>
                İleride gerekirse malzeme geri aktif hale getirilebilir
              </li>
            </ul>
          </div>
        </div>

        <div className="modal-actions">
          <div className="confirmation-section">
            <label className="confirmation-checkbox">
              <input 
                type="checkbox" 
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
              />
              <span className="checkmark"></span>
              <span className="confirmation-text">
                Yukarıdaki uyarıları okudum ve anladım. 
                {totalAffectedSuppliers > 0 && (
                  <span className="supplier-warning">
                    {' '}Bu işlemin <strong>{totalAffectedSuppliers} tedarikçiyi</strong> etkileyeceğini biliyorum.
                  </span>
                )}
                {' '}Malzeme{isBulk && totalMaterials > 1 ? 'leri' : 'yi'} kaldırmak istiyorum.
              </span>
            </label>
          </div>
          <div className="action-buttons">
            <button 
              className="btn btn-secondary" 
              onClick={handleClose}
            >
              İptal
            </button>
            <button 
              className="btn btn-danger" 
              onClick={handleConfirm}
              disabled={!confirmChecked || loading}
            >
              {loading ? 'İşleniyor...' : `${isBulk ? 'Toplu ' : ''}Kaldır (${totalMaterials})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MaterialDeletionWarningModal