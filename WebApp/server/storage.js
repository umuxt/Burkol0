import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Initialize S3 Client for Cloudflare R2
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

// Development fallback to local storage if credentials missing
const isR2Configured = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME;

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
} else {
    console.warn("⚠️ Cloudflare R2 credentials missing. File uploads will fail in production (Vercel).");
}

export async function uploadFileToStorage(fileBuffer, fileName, mimeType) {
    if (!isR2Configured) {
        throw new Error("Cloudflare R2 storage is not configured.");
    }

    try {
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: fileName,
            Body: fileBuffer,
            ContentType: mimeType,
        });

        await s3Client.send(command);

        // Return the public URL or key depending on your access setup
        // For private buckets, you might return the key.
        // If you have a custom domain or worker: `https://files.beeplan.com/${fileName}`
        return {
            key: fileName,
            url: `${process.env.R2_PUBLIC_URL || ''}/${fileName}`
        };
    } catch (error) {
        console.error("Error uploading to R2:", error);
        throw error;
    }
}

export async function deleteFileFromStorage(fileName) {
    if (!isR2Configured) return;

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
}
