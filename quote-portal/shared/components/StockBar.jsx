import React from 'react'

export default function StockBar({ stock, reorderPoint }) {
  const stockNum = Number(stock);
  const reorderNum = Number(reorderPoint);
  
  // Bar genişliği hesaplama (reorder point'in 3 katını maksimum olarak alıyoruz)
  const maxValue = Math.max(reorderNum * 3, stockNum * 1.1);
  const stockPercentage = Math.min((stockNum / maxValue) * 100, 100);
  const reorderPercentage = (reorderNum / maxValue) * 100;
  
  // Stok durumu kontrolü
  const isLowStock = stockNum <= reorderNum;
  const stockStatus = isLowStock ? 'low' : 'normal';
  
  return (
    <div className="stock-bar-container" title={`Stok: ${stockNum} | Reorder Point: ${reorderNum}`}>
      <div className="stock-bar-horizontal">
        <div className="stock-bar">
          <div className="stock-bar-background">
            {/* Reorder point çizgisi */}
            <div 
              className="reorder-line" 
              style={{ left: `${reorderPercentage}%` }}
            ></div>
            
            {/* Stok seviyesi bar */}
            <div 
              className={`stock-fill ${stockStatus}`}
              style={{ width: `${stockPercentage}%` }}
            ></div>
          </div>
        </div>
        
        <span className={`stock-current ${stockStatus}`}>
          {stockNum}
        </span>
      </div>
    </div>
  )
}