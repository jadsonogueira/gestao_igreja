export const dynamic = "force-dynamic";

type SongChordToken = { chord: string; pos: number };
type SongLine = { lyric: string; chords: SongChordToken[] };
type SongPart = { type: string; title?: string | null; lines: SongLine[] };

type SongDetail = {
  id: string;
  title: string;
  artist: string | null;
  originalKey: string;
  tags: string[];
  content: { parts: SongPart[] };
  createdAt: string;
  updatedAt: string;
};

async function getSong(id: string): Promise<SongDetail> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "";
  const url = base
    ? `${base}/api/songs/${id}`
    : `http://localhost:3000/api/songs/${id}`;

  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();

  if (!res.ok || !json?.success) {
    throw new Error(json?.error || "Erro ao buscar cifra");
  }

  return json.data as SongDetail;
}

function renderChordLine(lyric: string, chords: SongChordToken[]) {
  if (!chords?.length) return "";

  // cria uma linha em branco e posiciona os acordes por "pos"
  const len = Math.max(lyric.length, Math.max(...chords.map((c) => c.pos + c.chord.length)));
  const arr = Array(len).fill(" ");

  for (const c of chords) {
    const start = Math.max(0, Math.min(c.pos, arr.length - 1));
    for (let i = 0; i < c.chord.length && start + i < arr.length; i++) {
      arr[start + i] = c.chord[i];
    }
  }

  return arr.join("");
}

export default async function SongPage({ params }: { params: { id: string } }) {
  const song = await getSong(params.id);

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">{song.title}</h1>
        <div className="text-sm opacity-80">
          {song.artist ? `${song.artist} • ` : ""}
          Tom original: <strong>{song.originalKey}</strong>
        </div>

        {song.tags?.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {song.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border px-2 py-0.5 text-xs opacity-90"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
        {song.content.parts.map((part, idx) => (
          <section key={`${part.type}-${idx}`} className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
              {part.title ?? part.type}
            </div>

            <div className="space-y-3">
              {part.lines.map((line, i) => {
                const chordLine = renderChordLine(line.lyric, line.chords);

                return (
                  <div key={i} className="font-mono text-sm leading-6">
                    {chordLine ? (
                      <div className="whitespace-pre opacity-90">
                        {chordLine}
                      </div>
                    ) : null}

                    <div className="whitespace-pre">{line.lyric}</div>

                    {/* Chips clicáveis (versão simples: só lista de acordes da linha) */}
                    {line.chords?.length ? (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {line.chords.map((c, k) => (
                          <button
                            key={`${c.chord}-${k}`}
                            className="rounded-md border px-2 py-0.5 text-xs"
                            onClick={() => {
                              // por enquanto só prova de clique
                              console.log("Clicked chord:", c.chord);
                            }}
                          >
                            {c.chord}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}