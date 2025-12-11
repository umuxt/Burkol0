// Server File Handling Module - File upload and storage management
import { uploadFileToStorage, deleteFileFromStorage } from './storage.js'

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

        // Upload to Cloudflare R2
        try {
          await uploadFileToStorage(buffer, fileName, mimeType)

          persistedFiles.push({
            name: file.name,
            fileName, // Used as Key in R2
            size: buffer.length,
            mimeType,
            uploadedAt: new Date().toISOString(),
            storage: 'r2'
          })
        } catch (err) {
          console.error('R2 Upload failed, falling back to skip:', err)
        }
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
    // For R2, we assume it exists if we have the record, 
    // real check would require HEAD request to S3
    return {
      exists: true,
      size: 0, // Metadata only
      modifiedAt: new Date()
    }
  } catch (error) {
    return { exists: false }
  }
}

export async function deleteFile(fileName, uploadsDir) {
  try {
    await deleteFileFromStorage(fileName)
    return true
  } catch (error) {
    console.error('File deletion error:', error)
    return false
  }
}