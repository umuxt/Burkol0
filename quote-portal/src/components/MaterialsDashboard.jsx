import React from 'react'

export default function MaterialsDashboard({ materials = [] }) {
  const totalMaterials = materials.length;
  const lowStockMaterials = materials.filter(m => m.stock <= m.reorderPoint).length;
  const inactiveMaterials = materials.filter(m => m.status === 'Pasif').length;

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
      <div className="card">
        <h3>Pasif</h3>
        <p>{inactiveMaterials}</p>
      </div>
    </section>
  )
}