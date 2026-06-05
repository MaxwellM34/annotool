import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ImageRow, api } from "../lib/api";

export default function ImageListPage() {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.images().then((rows) => {
      setImages(rows);
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-semibold">Latest comparisons</h1>
        <p className="text-sm text-zinc-500">One image per page (slug); newest iteration only.</p>
      </div>
      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : images.length === 0 ? (
        <div className="rounded border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
          No images yet. Run <code className="text-zinc-300">scripts/push_to_annotool.sh</code> in the leblanc repo.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map((im) => (
            <Link
              to={`/annotate/${im.id}`}
              key={im.id}
              className="block bg-zinc-900 border border-zinc-800 rounded overflow-hidden hover:border-zinc-600 transition"
            >
              <div className="aspect-video bg-zinc-950 overflow-hidden flex items-center justify-center">
                <img
                  src={api.imagePngUrl(im.id)}
                  alt={im.slug}
                  className="max-w-full max-h-full object-contain"
                  loading="lazy"
                />
              </div>
              <div className="p-3 flex items-baseline justify-between">
                <div>
                  <div className="font-medium">{im.slug}</div>
                  <div className="text-xs text-zinc-500">
                    iter {im.iter} · {im.width}×{im.height}
                  </div>
                </div>
                {im.your_latest_round ? (
                  <span className="text-xs text-zinc-400">round {im.your_latest_round}</span>
                ) : (
                  <span className="text-xs text-emerald-400">new</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
