import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ImageRow, api } from "../lib/api";

// Device class definition. Each viewport (string in slug suffix) maps to one class.
type DeviceClass = "phone" | "tablet" | "desktop";
type Viewport = "375" | "414" | "768" | "1024" | "1440" | "1920";

const DEVICE_GROUPS: { key: DeviceClass; label: string; icon: string; sizes: { vp: Viewport; label: string; description: string }[] }[] = [
  {
    key: "phone",
    label: "Phone",
    icon: "📱",
    sizes: [
      { vp: "375", label: "Small phone", description: "375 px (iPhone Mini)" },
      { vp: "414", label: "Large phone", description: "414 px (iPhone Plus)" },
    ],
  },
  {
    key: "tablet",
    label: "Tablet",
    icon: "📲",
    sizes: [
      { vp: "768", label: "Tablet portrait", description: "768 px (iPad)" },
      { vp: "1024", label: "Tablet landscape", description: "1024 px (iPad landscape / small laptop)" },
    ],
  },
  {
    key: "desktop",
    label: "Computer",
    icon: "💻",
    sizes: [
      { vp: "1440", label: "Desktop", description: "1440 px (standard)" },
      { vp: "1920", label: "Wide desktop", description: "1920 px (wide)" },
    ],
  },
];

const ALL_VIEWPORTS: Viewport[] = ["375", "414", "768", "1024", "1440", "1920"];

// Pretty page-title from base slug, e.g. "on-set-coaching" → "On Set Coaching"
function prettifySlug(base: string): string {
  return base
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Split a slug like "our-team-375" into { base: "our-team", viewport: "375" }.
// If the suffix isn't a known viewport, returns { base: slug, viewport: null }.
function splitSlug(slug: string): { base: string; viewport: Viewport | null } {
  const m = slug.match(/^(.*)-(\d{3,4})$/);
  if (m && ALL_VIEWPORTS.includes(m[2] as Viewport)) {
    return { base: m[1], viewport: m[2] as Viewport };
  }
  return { base: slug, viewport: null };
}

type PageGroup = {
  base: string;
  prettyName: string;
  byViewport: Partial<Record<Viewport, ImageRow>>;
  fullImage?: ImageRow; // legacy non-viewport image (the full sxs)
};

function groupImages(images: ImageRow[]): PageGroup[] {
  const map = new Map<string, PageGroup>();
  for (const im of images) {
    const { base, viewport } = splitSlug(im.slug);
    if (!map.has(base)) {
      map.set(base, {
        base,
        prettyName: prettifySlug(base),
        byViewport: {},
      });
    }
    const grp = map.get(base)!;
    if (viewport) {
      grp.byViewport[viewport] = im;
    } else {
      // Legacy full-sxs entry (slug doesn't end in a viewport number)
      grp.fullImage = im;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.prettyName.localeCompare(b.prettyName));
}

function statusFor(im: ImageRow | undefined): "passed" | "annotated" | "unreviewed" | "missing" {
  if (!im) return "missing";
  if (im.your_latest_passed) return "passed";
  if ((im.your_latest_annotation_count || 0) > 0) return "annotated";
  return "unreviewed";
}

function StatusBadge({ status }: { status: ReturnType<typeof statusFor> }) {
  switch (status) {
    case "passed":
      return <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">✓ Passes</span>;
    case "annotated":
      return <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium">✎ Notes</span>;
    case "unreviewed":
      return <span className="inline-flex items-center gap-1 text-zinc-500 text-xs">Pending</span>;
    case "missing":
      return <span className="inline-flex items-center gap-1 text-zinc-600 text-xs">No image</span>;
  }
}

function SizeButton({
  im,
  size,
  description,
}: {
  im: ImageRow | undefined;
  size: { vp: Viewport; label: string };
  description: string;
}) {
  const status = statusFor(im);
  if (!im) {
    return (
      <div
        title={`${size.label} (${description}) — not pushed yet`}
        className="rounded-md border border-zinc-800 bg-zinc-950 p-3 opacity-50 cursor-not-allowed"
      >
        <div className="flex items-baseline justify-between">
          <div className="font-medium text-sm text-zinc-400">{size.label}</div>
          <StatusBadge status={status} />
        </div>
        <div className="text-xs text-zinc-600 mt-1">{description}</div>
      </div>
    );
  }
  const border =
    status === "passed"
      ? "border-emerald-700/60 hover:border-emerald-500"
      : status === "annotated"
        ? "border-amber-700/60 hover:border-amber-500"
        : "border-zinc-700 hover:border-zinc-500";
  return (
    <Link
      to={`/annotate/${im.id}`}
      title={`${size.label} (${description}) — iter ${im.iter}`}
      className={`block rounded-md border ${border} bg-zinc-950 p-3 transition`}
    >
      <div className="flex items-baseline justify-between">
        <div className="font-medium text-sm">{size.label}</div>
        <StatusBadge status={status} />
      </div>
      <div className="text-xs text-zinc-500 mt-1">{description}</div>
      <div className="text-xs text-zinc-600 mt-1">iter {im.iter} · {im.width}×{im.height}</div>
    </Link>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : (done / total) * 100;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
        <span>{done} of {total} sizes reviewed</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 rounded bg-zinc-800 overflow-hidden">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PageCard({ group }: { group: PageGroup }) {
  const reviewedCount = ALL_VIEWPORTS.filter((vp) => {
    const im = group.byViewport[vp];
    return im && (im.your_latest_passed || (im.your_latest_annotation_count || 0) > 0);
  }).length;
  const availableCount = ALL_VIEWPORTS.filter((vp) => !!group.byViewport[vp]).length;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold">{group.prettyName}</h2>
        <span className="text-xs text-zinc-500">slug: <code className="text-zinc-400">{group.base}</code></span>
      </div>
      <div className="mb-4">
        <ProgressBar done={reviewedCount} total={availableCount} />
      </div>
      {availableCount === 0 ? (
        <p className="text-sm text-zinc-500">No images pushed yet for this page.</p>
      ) : (
        <div className="space-y-4">
          {DEVICE_GROUPS.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl" aria-hidden>{g.icon}</span>
                <span className="text-sm font-medium uppercase tracking-wide text-zinc-300">{g.label}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {g.sizes.map((s) => (
                  <SizeButton
                    key={s.vp}
                    im={group.byViewport[s.vp]}
                    size={{ vp: s.vp, label: s.label }}
                    description={s.description}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {group.fullImage && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <Link
            to={`/annotate/${group.fullImage.id}`}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            Open legacy full side-by-side (iter {group.fullImage.iter}) →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function ImageListPage() {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.images().then((rows) => {
      setImages(rows);
      setLoading(false);
    });
  }, []);

  const groups = useMemo(() => groupImages(images), [images]);

  const totals = useMemo(() => {
    let reviewed = 0;
    let available = 0;
    for (const g of groups) {
      for (const vp of ALL_VIEWPORTS) {
        const im = g.byViewport[vp];
        if (!im) continue;
        available += 1;
        if (im.your_latest_passed || (im.your_latest_annotation_count || 0) > 0) {
          reviewed += 1;
        }
      }
    }
    return { reviewed, available };
  }, [groups]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Pages to review</h1>
          <p className="text-sm text-zinc-500">One page per card. Open each device size; mark Passes inspection if nothing needs fixing.</p>
        </div>
        {totals.available > 0 && (
          <div className="text-sm text-zinc-400">
            Overall: <span className="text-emerald-400 font-medium">{totals.reviewed}</span> / {totals.available} sizes reviewed
          </div>
        )}
      </div>
      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="rounded border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
          No images yet. Run <code className="text-zinc-300">scripts/push_all_viewports_to_annotool.sh</code> from the leblanc repo.
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <PageCard key={g.base} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
