import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getBucketConfig } from './aws-config';

const s3Client = createS3Client();
const { bucketName, folderPrefix } = getBucketConfig();
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';

function assertS3Env() {
  if (!bucketName) {
    throw new Error('AWS_BUCKET_NAME não definido no ambiente.');
  }
}

export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  isPublic: boolean = false
): Promise<{ uploadUrl: string; cloud_storage_path: string }> {
  assertS3Env();

  const timestamp = Date.now();
  const sanitizedFileName = fileName?.replace(/[^a-zA-Z0-9.-]/g, '_') ?? 'file';

  const cloud_storage_path = isPublic
    ? `${folderPrefix}public/uploads/${timestamp}-${sanitizedFileName}`
    : `${folderPrefix}uploads/${timestamp}-${sanitizedFileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ContentType: contentType,
    // se você quiser realmente "public", isso aqui NÃO torna público sozinho.
    // isso só define header; a permissão depende do bucket policy.
    ContentDisposition: isPublic ? 'attachment' : undefined,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  return { uploadUrl, cloud_storage_path };
}

export async function getFileUrl(cloud_storage_path: string, isPublic: boolean = false): Promise<string> {
  assertS3Env();

  if (isPublic) {
    return `https://${bucketName}.s3.${region}.amazonaws.com/${cloud_storage_path}`;
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ResponseContentDisposition: 'attachment',
  });

  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function deleteFile(cloud_storage_path: string): Promise<void> {
  assertS3Env();

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
  });

  await s3Client.send(command);
}
