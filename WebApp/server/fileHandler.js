// Server File Handling Module - File upload and storage management
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'

export function safeName(name) {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid data URL format')
  
  const [, mimeType, base64Data] = match
  const buffer = Buffer.from(base64Data, 'base64')
  
  return { mimeType, buffer }
}

export async function persistFilesForQuote(quoteId, files, uploadsDir) {
  if (!files || !Array.isArray(files) || files.length === 0) {
    return []
  }

  const persistedFiles = []

  for (const file of files) {
    try {
      if (file.dataUrl && file.name) {
        const { mimeType, buffer } = parseDataUrl(file.dataUrl)
        const sanitizedName = safeName(file.name)
        const fileName = `${quoteId}_${Date.now()}_${sanitizedName}`
        const filePath = path.join(uploadsDir, fileName)

        await fsp.writeFile(filePath, buffer)

        persistedFiles.push({
          name: file.name,
          fileName,
          size: buffer.length,
          mimeType,
          uploadedAt: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error('File persistence error:', error)
      // Continue with other files even if one fails
    }
  }

  return persistedFiles
}

export async function getFileInfo(fileName, uploadsDir) {
  try {
    const filePath = path.join(uploadsDir, fileName)
    const stats = await fsp.stat(filePath)
    return {
      exists: true,
      size: stats.size,
      modifiedAt: stats.mtime
    }
  } catch (error) {
    return { exists: false }
  }
}

export async function deleteFile(fileName, uploadsDir) {
  try {
    const filePath = path.join(uploadsDir, fileName)
    await fsp.unlink(filePath)
    return true
  } catch (error) {
    console.error('File deletion error:', error)
    return false
  }
}