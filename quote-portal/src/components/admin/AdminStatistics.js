// Admin Statistics - Data analysis and chart generation
import React from 'react';
import { formatPrice } from '../../lib/utils.js';

export function calculateStatistics(list, metric = 'count') {
  const stats = {
    total: list.length,
    byStatus: {},
    byMaterial: {},
    byProcess: {},
    byMonth: {},
    totalValue: 0,
    avgValue: 0
  }

  // Calculate totals
  let totalValue = 0
  list.forEach(item => {
    const price = parseFloat(item.price) || 0
    totalValue += price
  })
  
  stats.totalValue = totalValue
  stats.avgValue = list.length > 0 ? totalValue / list.length : 0

  // Group by status
  list.forEach(item => {
    const status = item.status || 'unknown'
    if (!stats.byStatus[status]) {
      stats.byStatus[status] = { count: 0, value: 0 }
    }
    stats.byStatus[status].count++
    stats.byStatus[status].value += parseFloat(item.price) || 0
  })

  // Group by material
  list.forEach(item => {
    const material = item.material || 'unknown'
    if (!stats.byMaterial[material]) {
      stats.byMaterial[material] = { count: 0, value: 0 }
    }
    stats.byMaterial[material].count++
    stats.byMaterial[material].value += parseFloat(item.price) || 0
  })

  // Group by process (handle arrays)
  list.forEach(item => {
    const processes = Array.isArray(item.process) ? item.process : [item.process].filter(Boolean)
    processes.forEach(process => {
      if (!stats.byProcess[process]) {
        stats.byProcess[process] = { count: 0, value: 0 }
      }
      stats.byProcess[process].count++
      stats.byProcess[process].value += (parseFloat(item.price) || 0) / processes.length // Distribute price across processes
    })
  })

  // Group by month
  list.forEach(item => {
    const date = item.createdAt || item.date || ''
    const month = date.slice(0, 7) // YYYY-MM format
    if (month) {
      if (!stats.byMonth[month]) {
        stats.byMonth[month] = { count: 0, value: 0 }
      }
      stats.byMonth[month].count++
      stats.byMonth[month].value += parseFloat(item.price) || 0
    }
  })

  // Convert to chart data format
  const convertToChartData = (data) => {
    return Object.entries(data).map(([key, value]) => ({
      label: key,
      count: value.count,
      value: value.value
    })).sort((a, b) => {
      if (metric === 'value') {
        return b.value - a.value
      }
      return b.count - a.count
    })
  }

  stats.byStatus = convertToChartData(stats.byStatus)
  stats.byMaterial = convertToChartData(stats.byMaterial)
  stats.byProcess = convertToChartData(stats.byProcess)
  stats.byMonth = convertToChartData(stats.byMonth).sort((a, b) => a.label.localeCompare(b.label))

  return stats
}

export function BarChart({ data, xLabel, yLabel, byKeyAlpha = false }) {
  if (!data || data.length === 0) {
    return React.createElement('div', { 
      style: { 
        padding: '20px', 
        textAlign: 'center', 
        color: '#666',
        border: '1px solid #ddd',
        borderRadius: '4px',
        backgroundColor: '#f9f9f9'
      } 
    }, 'Veri bulunamadı')
  }

  // Sort data if needed
  const sortedData = byKeyAlpha 
    ? [...data].sort((a, b) => a.label.localeCompare(b.label))
    : data

  const maxValue = Math.max(...sortedData.map(item => yLabel.includes('Toplam') ? item.value : item.count))
  const chartHeight = 200
  const chartWidth = 400
  const padding = { top: 20, right: 20, bottom: 60, left: 60 }
  
  const barWidth = Math.max(20, (chartWidth - padding.left - padding.right) / sortedData.length - 10)
  
  return React.createElement('div', { 
    style: { 
      border: '1px solid #ddd', 
      borderRadius: '8px', 
      padding: '16px',
      backgroundColor: 'white'
    } 
  },
    React.createElement('h4', { 
      style: { 
        margin: '0 0 16px 0', 
        fontSize: '14px', 
        color: '#333',
        textAlign: 'center'
      } 
    }, `${xLabel} - ${yLabel}`),
    
    React.createElement('div', { 
      style: { 
        position: 'relative',
        height: chartHeight + padding.top + padding.bottom,
        overflow: 'auto'
      }
    },
      React.createElement('svg', {
        width: Math.max(chartWidth, sortedData.length * (barWidth + 10) + padding.left + padding.right),
        height: chartHeight + padding.top + padding.bottom,
        style: { display: 'block' }
      },
        // Y-axis
        React.createElement('line', {
          x1: padding.left,
          y1: padding.top,
          x2: padding.left,
          y2: chartHeight + padding.top,
          stroke: '#333',
          strokeWidth: 1
        }),
        
        // X-axis
        React.createElement('line', {
          x1: padding.left,
          y1: chartHeight + padding.top,
          x2: sortedData.length * (barWidth + 10) + padding.left,
          y2: chartHeight + padding.top,
          stroke: '#333',
          strokeWidth: 1
        }),
        
        // Bars
        ...sortedData.map((item, index) => {
          const value = yLabel.includes('Toplam') ? item.value : item.count
          const barHeight = maxValue > 0 ? (value / maxValue) * chartHeight : 0
          const x = padding.left + index * (barWidth + 10) + 5
          const y = padding.top + chartHeight - barHeight
          
          return React.createElement('g', { key: item.label },
            // Bar
            React.createElement('rect', {
              x,
              y,
              width: barWidth,
              height: barHeight,
              fill: getBarColor(index),
              stroke: '#333',
              strokeWidth: 1
            }),
            
            // Value label on top of bar
            React.createElement('text', {
              x: x + barWidth / 2,
              y: y - 5,
              textAnchor: 'middle',
              fontSize: '10px',
              fill: '#333'
            }, yLabel.includes('Toplam') ? formatPrice(value) : value),
            
            // X-axis label
            React.createElement('text', {
              x: x + barWidth / 2,
              y: chartHeight + padding.top + 15,
              textAnchor: 'middle',
              fontSize: '10px',
              fill: '#333',
              transform: `rotate(-45, ${x + barWidth / 2}, ${chartHeight + padding.top + 15})`
            }, item.label.length > 10 ? item.label.substring(0, 10) + '...' : item.label)
          )
        }),
        
        // Y-axis label
        React.createElement('text', {
          x: 15,
          y: padding.top + chartHeight / 2,
          textAnchor: 'middle',
          fontSize: '12px',
          fill: '#333',
          transform: `rotate(-90, 15, ${padding.top + chartHeight / 2})`
        }, yLabel)
      )
    )
  )
}

function getBarColor(index) {
  const colors = [
    '#007bff', '#28a745', '#ffc107', '#dc3545', '#6c757d',
    '#17a2b8', '#fd7e14', '#e83e8c', '#6f42c1', '#20c997'
  ]
  return colors[index % colors.length]
}
