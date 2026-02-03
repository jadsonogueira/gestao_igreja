// lib/s3.ts
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3Client, getBucketConfig } from "./aws-config";

const s3Client = createS3Client();
const { bucketName, folderPrefix } = getBucketConfig();

/**
 * IMPORTANTE (Cloudflare R2):
 * - Não existe URL no padrão: https://<bucket>.s3.<region>.amazonaws.com/...
 * - Para servir publicamente, você precisa de um "Public R2 Bucket" + "Public Domain"
 *   OU usar sempre URL assinada (recomendado aqui).
 */

function normalizeKey(key: string) {
  return String(key || "").replace(/^\/+/, "");
}

function ensurePrefixed(key: string) {
  const k = normalizeKey(key);
  const prefix = normalizeKey(folderPrefix || "");
  if (!prefix) return k;
  return k.startsWith(prefix) ? k : `${prefix}${k}`;
}

export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  isPublic: boolean = false
): Promise<{ uploadUrl: string; cloud_storage_path: string }> {
  const timestamp = Date.now();
  const sanitizedFileName = (fileName?.replace(/[^a-zA-Z0-9.-]/g, "_") ?? "file").trim();

  const rawKey = isPublic
    ? `public/uploads/${timestamp}-${sanitizedFileName}`
    : `uploads/${timestamp}-${sanitizedFileName}`;

  const cloud_storage_path = ensurePrefixed(rawKey);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ContentType: contentType || "application/octet-stream",
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return { uploadUrl, cloud_storage_path };
}

export async function getFileUrl(
  cloud_storage_path: string,
  options?: { public?: boolean; download?: boolean; expiresIn?: number }
): Promise<string> {
  const download = options?.download ?? false;
  const expiresIn = options?.expiresIn ?? 3600;

  const key = ensurePrefixed(cloud_storage_path);

  // ✅ Para R2: sempre use URL assinada para GET (inclusive "public/...")
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
    ...(download ? { ResponseContentDisposition: "attachment" } : { ResponseContentDisposition: "inline" }),
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

export async function deleteFile(cloud_storage_path: string): Promise<void> {
  const key = ensurePrefixed(cloud_storage_path);

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await s3Client.send(command);
}
