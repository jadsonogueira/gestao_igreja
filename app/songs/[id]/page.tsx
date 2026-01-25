export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "@/lib/db";
import SongViewer from "./SongViewer";

type SongChordToken = { chord: string; pos: number };
type SongLine = { lyric: string; chords: SongChordToken[] };
type SongPart = { type: string; title?: string | null; lines: SongLine[] };

type SongContent = { parts: SongPart[] };

export type SongDetail = {
  id: string;
  title: string;
  artist: string | null;
  originalKey: string;
  tags: string[];
  content: SongContent;
  createdAt: string;
  updatedAt: string;
};

export default async function SongPage({ params }: { params: { id: string } }) {
  const id = params.id;

  const song = await prisma.song.findUnique({ where: { id } });

  if (!song) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <h1 className="text-xl font-semibold">Cifra não encontrada</h1>
        <p className="mt-2 text-sm opacity-80">
          ID: <span className="font-mono">{id}</span>
        </p>
      </main>
    );
  }

  const data: SongDetail = {
    id: song.id,
    title: song.title,
    artist: song.artist ?? null,
    originalKey: song.originalKey,
    tags: song.tags ?? [],
    content: song.content as any,
    createdAt: song.createdAt.toISOString(),
    updatedAt: song.updatedAt.toISOString(),
  };

  return <SongViewer song={data} />;
}