import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Annotation,
  AnnotationSet,
  ImageRow,
  api,
} from "../lib/api";
import { useTimeTracker } from "../hooks/useTimeTracker";

function makeId() {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function AnnotatorPage() {
  const { imageId } = useParams();
  const id = Number(imageId);
  const [image, setImage] = useState<ImageRow | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [round, setRound] = useState<number | null>(null);
  const [history, setHistory] = useState<AnnotationSet[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { activeNow } = useTimeTracker(id, !!image);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.imageMeta(id), api.annotationsFor(id)]).then(([im, sets]) => {
      if (cancelled) return;
      setImage(im);
      setHistory(sets);
      if (sets.length > 0) {
        const latest = sets[sets.length - 1];
        setRound(latest.round + 1);
      } else {
        setRound(1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const selected = useMemo(
    () => annotations.find((a) => a.id === selectedId) || null,
    [annotations, selectedId],
  );

  function updateSelected(patch: Partial<Annotation>) {
    if (!selectedId) return;
    setAnnotations((prev) => prev.map((a) => (a.id === selectedId ? { ...a, ...patch } : a)));
  }

  function deleteSelected() {
    if (!selectedId) return;
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
    setSelectedId(null);
  }

  async function save() {
    if (!image || round === null) return;
    setSaving(true);
    try {
      const saved = await api.saveAnnotation({
        image_id: image.id,
        round,
        payload: { annotations },
      });
      setSavedAt(saved.saved_at);
      // refresh history
      const sets = await api.annotationsFor(image.id);
      setHistory(sets);
    } finally {
      setSaving(false);
    }
  }

  async function markPassed() {
    if (!image || round === null) return;
    if (annotations.length > 0 && !confirm("You have annotations drawn. Marking as Passes inspection will save an empty pass record instead. Continue?")) {
      return;
    }
    setSaving(true);
    try {
      const saved = await api.saveAnnotation({
        image_id: image.id,
        round,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload: { annotations: [], passed: true } as any,
      });
      setSavedAt(saved.saved_at);
      setAnnotations([]);
      const sets = await api.annotationsFor(image.id);
      setHistory(sets);
    } finally {
      setSaving(false);
    }
  }

  if (!image) return <div className="p-8 text-zinc-400">Loading image…</div>;

  return (
    <div className="flex h-[calc(100vh-49px)]">
      <Canvas
        image={image}
        annotations={annotations}
        setAnnotations={setAnnotations}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
      />
      <aside className="w-96 border-l border-zinc-800 bg-zinc-950 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">
              {image.slug} <span className="text-zinc-500 text-sm">iter {image.iter}</span>
            </h2>
            <span
              className={`text-xs rounded-full px-2 py-0.5 ${
                activeNow ? "bg-emerald-950 text-emerald-400" : "bg-zinc-800 text-zinc-400"
              }`}
              title={activeNow ? "tracking time" : "paused (no input >30s)"}
            >
              {activeNow ? "tracking" : "paused"}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Round {round ?? "—"} · drag on the image to draw a rectangle.
          </p>
        </div>

        <div className="p-4 border-b border-zinc-800 space-y-2 max-h-72 overflow-auto">
          {annotations.length === 0 && (
            <p className="text-sm text-zinc-500">No annotations yet.</p>
          )}
          {annotations.map((a, i) => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className={`block w-full text-left rounded border p-2 text-sm ${
                a.id === selectedId
                  ? "border-accent bg-zinc-900"
                  : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium">#{i + 1}</span>
                <span
                  className="w-3 h-3 rounded"
                  style={{ background: a.color }}
                />
              </div>
              <div className="text-zinc-400 text-xs line-clamp-2 mt-1">
                {a.note || "(no note)"}
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="p-4 border-b border-zinc-800 space-y-3">
            <h3 className="text-sm font-medium">Edit annotation</h3>
            <textarea
              value={selected.note}
              onChange={(e) => updateSelected({ note: e.target.value })}
              placeholder="Note for this rectangle…"
              className="w-full h-32 bg-zinc-900 border border-zinc-800 rounded p-2 text-sm focus:outline-none focus:border-zinc-600"
            />
            <div className="flex items-center gap-2 text-sm">
              <label className="text-zinc-500">Color</label>
              <input
                type="color"
                value={selected.color}
                onChange={(e) => updateSelected({ color: e.target.value })}
                className="w-8 h-8 bg-transparent"
              />
              <label className="ml-3 text-zinc-500">Width</label>
              <input
                type="number"
                min={1}
                max={20}
                value={selected.strokeWidth}
                onChange={(e) => updateSelected({ strokeWidth: Number(e.target.value) || 6 })}
                className="w-16 bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
              />
              <button
                onClick={deleteSelected}
                className="ml-auto text-red-400 hover:text-red-300 text-xs"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        <div className="p-4 border-b border-zinc-800 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={save}
              disabled={saving || annotations.length === 0}
              className="px-4 py-2 rounded bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              {saving ? "Saving…" : `Save round ${round ?? ""}`}
            </button>
            <button
              onClick={markPassed}
              disabled={saving}
              title="Mark this viewport as reviewed with no issues — saves an empty pass record."
              className="px-4 py-2 rounded border border-emerald-700 text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-40 text-sm font-medium"
            >
              ✓ Passes inspection
            </button>
            {savedAt && (
              <span className="text-xs text-zinc-500">
                saved {new Date(savedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            Use <strong>Save round</strong> to record annotations you've drawn, or <strong>Passes inspection</strong> if nothing on this viewport needs to change.
          </p>
        </div>

        <div className="p-4 flex-1 overflow-auto">
          <h3 className="text-sm font-medium mb-2">Previous rounds</h3>
          {history.length === 0 ? (
            <p className="text-xs text-zinc-500">None.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {history.map((s) => (
                <li
                  key={s.id}
                  className="rounded border border-zinc-800 bg-zinc-900/40 p-2"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">round {s.round}</span>
                    <span className="text-xs text-zinc-500">
                      {new Date(s.saved_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(s.payload as any).passed ? (
                      <span className="text-emerald-400 font-medium">✓ Passed inspection</span>
                    ) : (
                      <>
                        {s.payload.annotations.length} annotation
                        {s.payload.annotations.length === 1 ? "" : "s"}
                      </>
                    )}
                    {" · "}
                    <a
                      className="underline"
                      href={api.annotatedPngUrl(s.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      view PNG
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800">
          <Link to="/" className="text-xs text-zinc-400 hover:text-white">
            ← Back to images
          </Link>
        </div>
      </aside>
    </div>
  );
}

function Canvas({
  image,
  annotations,
  setAnnotations,
  selectedId,
  setSelectedId,
}: {
  image: ImageRow;
  annotations: Annotation[];
  setAnnotations: (fn: (prev: Annotation[]) => Annotation[]) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<{
    id: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);

  function imgCoords(clientX: number, clientY: number) {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const scaleX = image.width / rect.width;
    const scaleY = image.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    const pt = imgCoords(e.clientX, e.clientY);
    const id = makeId();
    setDrawing({ id, start: pt, end: pt });
    setSelectedId(null);
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!drawing) return;
    const pt = imgCoords(e.clientX, e.clientY);
    setDrawing({ ...drawing, end: pt });
  }

  function onMouseUp() {
    if (!drawing) return;
    const dx = Math.abs(drawing.end.x - drawing.start.x);
    const dy = Math.abs(drawing.end.y - drawing.start.y);
    if (dx >= 8 && dy >= 8) {
      const ann: Annotation = {
        id: drawing.id,
        shape: "rect",
        coords: [drawing.start, drawing.end],
        color: "#FF3A4D",
        strokeWidth: 6,
        note: "",
      };
      setAnnotations((prev) => [...prev, ann]);
      setSelectedId(ann.id);
    }
    setDrawing(null);
  }

  function rectFromCoords(c: { x: number; y: number }[]) {
    if (c.length < 2) return { x: 0, y: 0, w: 0, h: 0 };
    const x = Math.min(c[0].x, c[1].x);
    const y = Math.min(c[0].y, c[1].y);
    const w = Math.abs(c[1].x - c[0].x);
    const h = Math.abs(c[1].y - c[0].y);
    return { x, y, w, h };
  }

  return (
    <div className="flex-1 bg-zinc-950 overflow-auto">
      <div className="p-4 inline-block min-w-full">
        <div
          ref={containerRef}
          className="relative cursor-crosshair select-none mx-auto"
          style={{ width: "100%", maxWidth: 1400 }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <img
            src={api.imagePngUrl(image.id)}
            alt={image.slug}
            draggable={false}
            className="block w-full h-auto pointer-events-none"
          />
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${image.width} ${image.height}`}
            preserveAspectRatio="none"
          >
            {annotations.map((a, i) => {
              const r = rectFromCoords(a.coords);
              const isSel = a.id === selectedId;
              return (
                <g key={a.id}>
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={a.strokeWidth}
                    strokeDasharray={isSel ? "12 8" : undefined}
                  />
                  <rect
                    x={r.x}
                    y={Math.max(0, r.y - 36)}
                    width={56}
                    height={36}
                    fill={a.color}
                  />
                  <text
                    x={r.x + 18}
                    y={Math.max(28, r.y - 8)}
                    fill="white"
                    fontSize={28}
                    fontWeight={700}
                  >
                    {i + 1}
                  </text>
                </g>
              );
            })}
            {drawing && (
              <rect
                x={Math.min(drawing.start.x, drawing.end.x)}
                y={Math.min(drawing.start.y, drawing.end.y)}
                width={Math.abs(drawing.end.x - drawing.start.x)}
                height={Math.abs(drawing.end.y - drawing.start.y)}
                fill="rgba(255,58,77,0.1)"
                stroke="#FF3A4D"
                strokeWidth={6}
                strokeDasharray="12 8"
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
