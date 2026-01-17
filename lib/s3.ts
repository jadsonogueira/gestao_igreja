import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig } from './aws-config';

const s3Client = createS3Client();
const { bucketName, folderPrefix } = getBucketConfig();
const region = process.env.AWS_REGION ?? 'us-east-1';

export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  isPublic: boolean = false
): Promise<{ uploadUrl: string; cloud_storage_path: string }> {
  const timestamp = Date.now();
  const sanitizedFileName = fileName?.replace(/[^a-zA-Z0-9.-]/g, '_') ?? 'file';

  const cloud_storage_path = isPublic
    ? `${folderPrefix}public/uploads/${timestamp}-${sanitizedFileName}`
    : `${folderPrefix}uploads/${timestamp}-${sanitizedFileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ContentType: contentType,
    // ✅ NÃO força attachment no upload
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return { uploadUrl, cloud_storage_path };
}

export async function getFileUrl(
  cloud_storage_path: string,
  options?: { public?: boolean; download?: boolean; expiresIn?: number }
): Promise<string> {
  const isPublic = options?.public ?? false;
  const download = options?.download ?? false;
  const expiresIn = options?.expiresIn ?? 3600;

  // Se você realmente tiver prefixo público com policy liberada, pode usar isso.
  if (isPublic) {
    return `https://${bucketName}.s3.${region}.amazonaws.com/${cloud_storage_path}`;
  }

  // ✅ Preview (inline) por padrão: NÃO setar ResponseContentDisposition
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ...(download ? { ResponseContentDisposition: 'attachment' } : {}),
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

export async function deleteFile(cloud_storage_path: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
  });

  await s3Client.send(command);
}
