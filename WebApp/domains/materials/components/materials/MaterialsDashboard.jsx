import React from 'react'

export default function MaterialsDashboard({ materials = [] }) {
  const totalMaterials = materials.length;
  const lowStockMaterials = materials.filter(m => m.stock <= m.reorderPoint).length;

  return (
    <section className="materials-dashboard is-inline">
      <div className="stat">
        <span className="stat-label">Toplam Malzeme</span>
        <span className="stat-value">{totalMaterials}</span>
      </div>
      <div className="divider"></div>
      <div className="stat">
        <span className="stat-label">Düşük Stok</span>
        <span className={`stat-value ${lowStockMaterials > 0 ? 'warning' : ''}`}>{lowStockMaterials}</span>
      </div>
    </section>
  )
}