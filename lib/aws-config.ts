import { S3Client } from '@aws-sdk/client-s3';

export function getBucketConfig() {
  return {
    bucketName: process.env.AWS_BUCKET_NAME ?? '',
    folderPrefix: process.env.AWS_FOLDER_PREFIX ?? '',
  };
}

export function createS3Client() {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';

  const hasStaticCreds =
    !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;

  // Opcional (caso use R2/MinIO)
  const endpoint = process.env.AWS_S3_ENDPOINT || undefined;
  const forcePathStyle = (process.env.AWS_FORCE_PATH_STYLE ?? 'false') === 'true';

  return new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: hasStaticCreds
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
          sessionToken: process.env.AWS_SESSION_TOKEN,
        }
      : undefined,
  });
}
