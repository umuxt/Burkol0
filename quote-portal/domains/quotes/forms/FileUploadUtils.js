import { showToast } from '../../../shared/components/MESToast.js';
import { showToast } from '../../../shared/components/MESToast.js';
// File Upload Utils - File handling for quote forms
import React from 'react';
import { ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES, extOf, readFileAsDataUrl, isImageExt } from '../../../shared/lib/utils.js'

export async function handleFileUpload(fileList, currentFiles, maxFiles = MAX_FILES, showToast) {
  const newFiles = []
  const errors = []

  // Check total file count
  if (currentFiles.length + fileList.length > maxFiles) {
    errors.push(`En fazla ${maxFiles} dosya yükleyebilirsiniz`)
    showToast(`En fazla ${maxFiles} dosya yükleyebilirsiniz`, 'error')
    return { files: currentFiles, errors }
  }

  for (const file of fileList) {
    try {
      // Check file size
      const sizeMB = file.size / (1024 * 1024)
      if (sizeMB > MAX_FILE_MB) {
        errors.push(`${file.name}: Dosya boyutu ${MAX_FILE_MB}MB'dan büyük olamaz`)
        continue
      }

      // Check file extension
      const ext = extOf(file.name)
      if (!ACCEPT_EXT.includes(ext.toLowerCase())) {
        errors.push(`${file.name}: Desteklenmeyen dosya türü`)
        continue
      }

      // Read file as data URL
      const dataUrl = await readFileAsDataUrl(file)
      
      newFiles.push({
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: dataUrl,
        isImage: isImageExt(ext)
      })
    } catch (error) {
      errors.push(`${file.name}: Dosya okuma hatası`)
    }
  }

  if (errors.length > 0) {
    showToast(errors.join(', '), 'error')
  }

  return { 
    files: [...currentFiles, ...newFiles], 
    errors 
  }
}

export async function handleProductFileUpload(fileList, currentFiles, showToast) {
  return handleFileUpload(fileList, currentFiles, MAX_PRODUCT_FILES, showToast)
}

export function removeFile(files, index) {
  return files.filter((_, i) => i !== index)
}

export function validateFileTypes(files) {
  const errors = []
  
  files.forEach(file => {
    const ext = extOf(file.name)
    if (!ACCEPT_EXT.includes(ext.toLowerCase())) {
      errors.push(`${file.name}: Desteklenmeyen dosya türü`)
    }
  })
  
  return errors
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function FilePreview({ file, onRemove, index, showToast }) {
  
  return React.createElement('div', {
    className: 'file-preview',
    style: {
      border: '1px solid #ddd',
      borderRadius: '4px',
      padding: '8px',
      margin: '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#f9f9f9'
    }
  },
    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
      React.createElement('div', { 
        style: { 
          fontWeight: 'bold', 
          fontSize: '13px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        } 
      }, file.name),
      React.createElement('div', { 
        style: { 
          fontSize: '11px', 
          color: '#666',
          marginTop: '2px'
        } 
      }, formatFileSize(file.size))
    ),
    
    file.isImage && React.createElement('img', {
      src: file.dataUrl,
      alt: file.name,
      style: {
        width: '40px',
        height: '40px',
        objectFit: 'cover',
        borderRadius: '4px',
        margin: '0 8px'
      }
    }),
    
    React.createElement('button', {
      type: 'button',
      onClick: () => onRemove(index),
      style: {
        background: '#dc3545',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        padding: '4px 8px',
        fontSize: '12px',
        cursor: 'pointer'
      }
    }, '×')
  )
}