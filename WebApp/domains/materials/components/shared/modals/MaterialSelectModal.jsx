import React from 'react'

/**
 * MaterialSelectModal - Tedarikçiye malzeme ekleme popup'ı
 * Mevcut malzemelerden seçim yapılmasını sağlar
 */
export default function MaterialSelectModal({
  isOpen,
  onClose,
  materialsLoading,
  filteredMaterials,
  selectedMaterials,
  materialSearchTerm,
  onSearchChange,
  onMaterialSelect,
  onAddExistingMaterials,
  getCategoryName
}) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay">
      <div className="modal-content-lg">
        {/* Popup Header */}
        <div className="modal-header-between">
          <h3 className="section-header">
            Mevcut Malzemelerden Seç
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="btn-close-x"
          >
            ×
          </button>
        </div>

        {/* Search Input */}
        <div className="mb-12">
          <input
            type="text"
            value={materialSearchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Malzeme adı, kodu veya kategorisi ile ara..."
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '14px',
              background: 'white'
            }}
          />
        </div>

        {/* Materials List */}
        {materialsLoading ? (
          <div className="empty-state-content">
            Malzemeler yükleniyor...
          </div>
        ) : (
          <div className="modal-list-scroll">
            {filteredMaterials.length === 0 ? (
              <div className="empty-state-content">
                {materialSearchTerm ? 'Arama kriterine uygun malzeme bulunamadı' : 'Henüz malzeme bulunmuyor'}
              </div>
            ) : (
              // Ensure only active materials are shown in this selection popup
              filteredMaterials
                .filter(material => material.status !== 'Kaldırıldı')
                .map(material => (
                  <div
                    key={material.id}
                    onClick={() => onMaterialSelect(material)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #f3f4f6',
                      cursor: 'pointer',
                      background: selectedMaterials.find(m => m.id === material.id) ? '#f0f9ff' : 'white',
                      fontSize: '14px',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!selectedMaterials.find(m => m.id === material.id)) {
                        e.target.style.backgroundColor = '#f9fafb'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selectedMaterials.find(m => m.id === material.id)) {
                        e.target.style.backgroundColor = 'white'
                      }
                    }}
                  >
                    <div className="label-bold-mb">
                      {material.name}
                      {selectedMaterials.find(m => m.id === material.id) && (
                        <span className="text-success-ml">✓ Seçildi</span>
                      )}
                    </div>
                    <div className="text-muted-xs">
                      {material.code && `Kod: ${material.code} • `}
                      {(() => { const cn = getCategoryName(material.category); return cn ? `Kategori: ${cn} • ` : '' })()}
                      {material.unit && `Birim: ${material.unit}`}
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {/* Selected Materials Summary */}
        {selectedMaterials.length > 0 && (
          <div className="selection-info-box">
            <div className="text-blue-title">
              Seçilen Malzemeler ({selectedMaterials.length})
            </div>
            <div className="text-link-blue">
              {selectedMaterials.map(m => m.name).join(', ')}
            </div>
          </div>
        )}

        {/* Popup Footer */}
        <div className="modal-footer-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary-md"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={onAddExistingMaterials}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              background: '#3b82f6',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            Seçimi Tamamla ({selectedMaterials.length})
          </button>
        </div>
      </div>
    </div>
  )
}
