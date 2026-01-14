export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { generatePresignedUploadUrl, getFileUrl } from '@/lib/s3';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fileName = body?.fileName ?? 'file';
    const contentType = body?.contentType ?? 'image/jpeg';
    const isPublic = body?.isPublic ?? true;

    const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(
      fileName,
      contentType,
      isPublic
    );

    return NextResponse.json({
      success: true,
      uploadUrl,
      cloud_storage_path,
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao gerar URL de upload' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cloud_storage_path = searchParams?.get('path') ?? '';
    const isPublic = searchParams?.get('isPublic') === 'true';

    if (!cloud_storage_path) {
      return NextResponse.json(
        { success: false, error: 'Caminho não fornecido' },
        { status: 400 }
      );
    }

    const url = await getFileUrl(cloud_storage_path, isPublic);

    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error('Error getting file URL:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao obter URL do arquivo' },
      { status: 500 }
    );
  }
}
