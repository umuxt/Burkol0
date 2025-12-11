import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize S3 Client for Cloudflare R2
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

// Development fallback to local storage if credentials missing
const isR2Configured = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME;
const isProduction = process.env.NODE_ENV === 'production';

// Local uploads directory
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'files');

let s3Client = null;

if (isR2Configured) {
    s3Client = new S3Client({
        region: "auto",
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
    });
} else if (isProduction) {
    console.warn("⚠️ Cloudflare R2 credentials missing. File uploads will fail in production (Vercel).");
} else {
    console.log("📁 Using local file storage (development mode)");
}

// Ensure uploads directory exists for local storage
async function ensureUploadsDir() {
    if (!existsSync(UPLOADS_DIR)) {
        await mkdir(UPLOADS_DIR, { recursive: true });
    }
}

export async function uploadFileToStorage(fileBuffer, fileName, mimeType) {
    // Production: use R2
    if (isR2Configured) {
        try {
            const command = new PutObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: fileName,
                Body: fileBuffer,
                ContentType: mimeType,
            });

            await s3Client.send(command);

            return {
                key: fileName,
                url: `${process.env.R2_PUBLIC_URL || ''}/${fileName}`
            };
        } catch (error) {
            console.error("Error uploading to R2:", error);
            throw error;
        }
    }

    // Development: use local file system
    if (!isProduction) {
        try {
            await ensureUploadsDir();
            const filePath = path.join(UPLOADS_DIR, fileName);
            await writeFile(filePath, fileBuffer);

            return {
                key: fileName,
                url: `/uploads/files/${fileName}`
            };
        } catch (error) {
            console.error("Error saving to local storage:", error);
            throw error;
        }
    }

    // Production without R2 - error
    throw new Error("Cloudflare R2 storage is not configured.");
}

export async function deleteFileFromStorage(fileName) {
    if (isR2Configured) {
        try {
            const command = new DeleteObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: fileName,
            });

            await s3Client.send(command);
        } catch (error) {
            console.error("Error deleting from R2:", error);
            throw error;
        }
        return;
    }

    // Development: delete from local file system
    if (!isProduction) {
        try {
            const filePath = path.join(UPLOADS_DIR, fileName);
            if (existsSync(filePath)) {
                await unlink(filePath);
            }
        } catch (error) {
            console.error("Error deleting from local storage:", error);
            // Don't throw - file might not exist
        }
    }
}
