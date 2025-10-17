import React from 'react'

export default function MaterialsDashboard({ materials = [] }) {
  const totalMaterials = materials.length;
  const lowStockMaterials = materials.filter(m => m.stock <= m.reorderPoint).length;
  // Removed inactiveMaterials since materials only have 'Aktif' or 'Kaldırıldı' status

  return (
    <section className="materials-dashboard">
      <div className="card">
        <h3>Toplam Malzeme</h3>
        <p>{totalMaterials}</p>
      </div>
      <div className="card">
        <h3>Düşük Stok</h3>
        <p className={lowStockMaterials > 0 ? 'warning' : ''}>{lowStockMaterials}</p>
      </div>
      {/* Removed Pasif card since materials only have 'Aktif' or 'Kaldırıldı' status */}
    </section>
  )
}