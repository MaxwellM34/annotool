import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ImageRow, api } from "../lib/api";

// ---------------------------------------------------------------------------
// Phases — user reviews web first, then tablet, then phone. The list only
// shows the current global phase's viewports for each page; previously
// approved phases collapse into small "still good?" thumbnails so a fresh
// worker push (which creates a new image_id and resets the pass status) is
// surfaced for re-review.
// ---------------------------------------------------------------------------

type Viewport = "375" | "414" | "768" | "1024" | "1440" | "1920";

type Phase = {
  key: "web" | "tablet" | "phone";
  label: string;
  icon: string;
  description: string;
  viewports: Viewport[]; // ordered primary first
};

const PHASES: Phase[] = [
  {
    key: "web",
    label: "Web (computer)",
    icon: "💻",
    description: "Start here. Review every page at desktop widths. Mark each ✓ Passes or annotate what needs to change. When all pages clear desktop, the tablet phase unlocks.",
    viewports: ["1920", "1440"],
  },
  {
    key: "tablet",
    label: "Tablet",
    icon: "📲",
    description: "Now the same pages on tablet widths. After approving a tablet view, glance at the small desktop thumbnail to make sure nothing regressed.",
    viewports: ["1024", "768"],
  },
  {
    key: "phone",
    label: "Phone",
    icon: "📱",
    description: "Finally, phone widths. After approving phone, re-check the desktop and tablet thumbnails on each card to confirm nothing broke up the chain.",
    viewports: ["414", "375"],
  },
];

const ALL_VIEWPORTS: Viewport[] = PHASES.flatMap((p) => p.viewports);

const VP_HUMAN_LABEL: Record<Viewport, string> = {
  "1920": "1920 px wide desktop",
  "1440": "1440 px standard desktop",
  "1024": "1024 px tablet landscape / small laptop",
  "768": "768 px tablet portrait (iPad)",
  "414": "414 px large phone (iPhone Plus)",
  "375": "375 px small phone (iPhone Mini)",
};

// ---------------------------------------------------------------------------
// Slug parsing
// ---------------------------------------------------------------------------

function prettifySlug(base: string): string {
  return base
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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
  legacyImage?: ImageRow;
};

function groupImages(images: ImageRow[]): PageGroup[] {
  const map = new Map<string, PageGroup>();
  for (const im of images) {
    const { base, viewport } = splitSlug(im.slug);
    if (!map.has(base)) {
      map.set(base, { base, prettyName: prettifySlug(base), byViewport: {} });
    }
    const grp = map.get(base)!;
    if (viewport) grp.byViewport[viewport] = im;
    else grp.legacyImage = im;
  }
  return Array.from(map.values()).sort((a, b) => a.prettyName.localeCompare(b.prettyName));
}

// ---------------------------------------------------------------------------
// Pass / phase logic
// ---------------------------------------------------------------------------

function viewportStatus(im: ImageRow | undefined): "passed" | "annotated" | "pending" | "missing" {
  if (!im) return "missing";
  if (im.your_latest_passed) return "passed";
  if ((im.your_latest_annotation_count || 0) > 0) return "annotated";
  return "pending";
}

// A page is "phase-complete" if every viewport in the phase that has an image uploaded
// has been passed by the user. A missing image counts as not-blocking (we can't review
// what hasn't been pushed) — but we surface a warning on the card.
function isPhaseCompleteForPage(group: PageGroup, phase: Phase): boolean {
  for (const vp of phase.viewports) {
    const im = group.byViewport[vp];
    if (!im) continue; // missing — non-blocking
    if (!im.your_latest_passed) return false;
  }
  // At least one viewport in this phase must exist and be passed for the page to count.
  return phase.viewports.some((vp) => group.byViewport[vp]?.your_latest_passed);
}

function currentGlobalPhase(groups: PageGroup[]): { phase: Phase; index: number; done: boolean } {
  for (let i = 0; i < PHASES.length; i++) {
    const phase = PHASES[i];
    const allPagesDone = groups.every((g) => isPhaseCompleteForPage(g, phase));
    if (!allPagesDone) return { phase, index: i, done: false };
  }
  return { phase: PHASES[PHASES.length - 1], index: PHASES.length - 1, done: true };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ReturnType<typeof viewportStatus> }) {
  switch (status) {
    case "passed":
      return <span className="text-emerald-400 text-xs font-medium">✓ Passes</span>;
    case "annotated":
      return <span className="text-amber-400 text-xs font-medium">✎ Notes drawn</span>;
    case "pending":
      return <span className="text-zinc-500 text-xs">Pending</span>;
    case "missing":
      return <span className="text-zinc-600 text-xs">No image yet</span>;
  }
}

function ActiveViewportButton({
  im,
  vp,
}: {
  im: ImageRow | undefined;
  vp: Viewport;
}) {
  const status = viewportStatus(im);
  if (!im) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 opacity-60">
        <div className="flex items-baseline justify-between mb-2">
          <div className="font-medium text-sm">{vp} px</div>
          <StatusBadge status={status} />
        </div>
        <div className="text-xs text-zinc-500">{VP_HUMAN_LABEL[vp]}</div>
        <div className="text-xs text-zinc-600 mt-1">Worker hasn't pushed this size yet. Re-run scripts/push_all_viewports_to_annotool.sh.</div>
      </div>
    );
  }
  const border =
    status === "passed"
      ? "border-emerald-600/70 hover:border-emerald-500"
      : status === "annotated"
        ? "border-amber-600/70 hover:border-amber-500"
        : "border-zinc-700 hover:border-accent";
  return (
    <Link
      to={`/annotate/${im.id}`}
      className={`block rounded-md border ${border} bg-zinc-950 overflow-hidden transition`}
    >
      <div className="aspect-video bg-zinc-900 overflow-hidden border-b border-zinc-800">
        <img
          src={api.imagePngUrl(im.id)}
          alt={`${im.slug} iter ${im.iter}`}
          className="w-full h-full object-contain"
          loading="lazy"
        />
      </div>
      <div className="p-3">
        <div className="flex items-baseline justify-between mb-1">
          <div className="font-medium text-sm">{vp} px</div>
          <StatusBadge status={status} />
        </div>
        <div className="text-xs text-zinc-500">{VP_HUMAN_LABEL[vp]}</div>
        <div className="text-xs text-zinc-600 mt-1">
          iter {im.iter} · click to {status === "passed" ? "re-check" : "review"}
        </div>
      </div>
    </Link>
  );
}

function PriorPhaseThumb({ phase, group }: { phase: Phase; group: PageGroup }) {
  // Find the first available image in this phase to show as a small thumb.
  const im = phase.viewports.map((vp) => group.byViewport[vp]).find(Boolean);
  if (!im) return null;
  const allPassed = phase.viewports.every((vp) => {
    const x = group.byViewport[vp];
    return !x || x.your_latest_passed;
  });
  return (
    <Link
      to={`/annotate/${im.id}`}
      title={`${phase.label} — ${allPassed ? "all approved" : "needs re-check"}`}
      className={`flex items-center gap-2 rounded border ${
        allPassed ? "border-emerald-800/60" : "border-amber-700/70"
      } bg-zinc-950 px-2 py-1 hover:border-zinc-500 transition`}
    >
      <span className="text-base">{phase.icon}</span>
      <div className="text-xs">
        <div className="font-medium">{phase.label}</div>
        <div className={`${allPassed ? "text-emerald-400" : "text-amber-400"}`}>
          {allPassed ? "✓ Approved" : "Needs re-check"}
        </div>
      </div>
    </Link>
  );
}

function PageCard({
  group,
  globalPhase,
  globalPhaseIndex,
}: {
  group: PageGroup;
  globalPhase: Phase;
  globalPhaseIndex: number;
}) {
  const pagePhaseDone = isPhaseCompleteForPage(group, globalPhase);
  const priorPhases = PHASES.slice(0, globalPhaseIndex);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-semibold">{group.prettyName}</h2>
        <div className="text-xs text-zinc-500 flex items-center gap-3">
          <span>
            slug: <code className="text-zinc-400">{group.base}</code>
          </span>
          {pagePhaseDone ? (
            <span className="text-emerald-400 font-medium">✓ {globalPhase.label} complete</span>
          ) : (
            <span>
              {globalPhase.icon} {globalPhase.label} in progress
            </span>
          )}
        </div>
      </div>

      {priorPhases.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="text-xs text-zinc-500 self-center mr-1">Previously approved (re-check after worker updates):</span>
          {priorPhases.map((p) => (
            <PriorPhaseThumb key={p.key} phase={p} group={group} />
          ))}
        </div>
      )}

      {pagePhaseDone ? (
        <div className="rounded-md border border-emerald-900/60 bg-emerald-950/30 p-4 text-sm text-emerald-300">
          ✓ This page is approved for the current phase. Waiting for the other pages to catch up before the next phase unlocks.
        </div>
      ) : (
        <div>
          <div className="text-xs text-zinc-500 mb-2">
            Review both sizes below. Mark each <span className="text-emerald-400">✓ Passes inspection</span> if nothing needs to change, or annotate what to fix.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {globalPhase.viewports.map((vp) => (
              <ActiveViewportButton key={vp} im={group.byViewport[vp]} vp={vp} />
            ))}
          </div>
        </div>
      )}

      {group.legacyImage && (
        <div className="mt-4 pt-3 border-t border-zinc-800">
          <Link
            to={`/annotate/${group.legacyImage.id}`}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Open legacy full-page side-by-side (iter {group.legacyImage.iter}) →
          </Link>
        </div>
      )}
    </div>
  );
}

function PhaseBanner({
  phaseIndex,
  phase,
  done,
  pagesComplete,
  pagesTotal,
}: {
  phaseIndex: number;
  phase: Phase;
  done: boolean;
  pagesComplete: number;
  pagesTotal: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 mb-6">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{phase.icon}</span>
          <div>
            <div className="text-sm text-zinc-500 uppercase tracking-wide">
              Step {phaseIndex + 1} of {PHASES.length}
            </div>
            <h1 className="text-2xl font-semibold">{phase.label}</h1>
          </div>
        </div>
        {done ? (
          <span className="rounded-full bg-emerald-950 text-emerald-300 px-3 py-1 text-sm">
            All phases done — site fully reviewed ✓
          </span>
        ) : (
          <div className="text-sm text-zinc-400">
            <span className="text-emerald-400 font-medium">{pagesComplete}</span> / {pagesTotal} pages cleared
          </div>
        )}
      </div>
      <p className="text-sm text-zinc-400 leading-relaxed mt-3">{phase.description}</p>
      <div className="flex gap-2 mt-3">
        {PHASES.map((p, i) => (
          <div
            key={p.key}
            className={`flex-1 h-1.5 rounded ${
              i < phaseIndex
                ? "bg-emerald-500"
                : i === phaseIndex
                  ? "bg-amber-400"
                  : "bg-zinc-700"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

const TUTORIAL_LS_KEY = "annotool_tutorial_dismissed_v1";

function Tutorial({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-zinc-900 border border-zinc-700 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">How to review</h2>
        <ol className="space-y-3 text-sm text-zinc-300 list-decimal list-inside">
          <li>
            <span className="font-medium">Step 1 — 💻 Web.</span> Click a desktop size (1920 or 1440). The page render appears next to the Figma design. If everything matches the design, click <span className="text-emerald-400 font-medium">✓ Passes inspection</span>. If something looks wrong, draw a rectangle over the issue and type what should change. Save.
          </li>
          <li>
            <span className="font-medium">Step 2 — 📲 Tablet.</span> Tablet sizes (1024 and 768) unlock only after every page clears Web. Repeat the same review on tablet widths.
          </li>
          <li>
            <span className="font-medium">Step 3 — 📱 Phone.</span> Phone sizes (414 and 375) unlock after tablet. Mobile may look intentionally different from Figma — focus on whether it looks beautiful on a phone, not whether it matches desktop pixel-for-pixel.
          </li>
          <li>
            <span className="font-medium">After updates.</span> When a developer pushes a fix, your prior approval for that image resets and the small thumbnails at the top of each card surface as <span className="text-amber-400 font-medium">Needs re-check</span>. Click them to verify nothing broke higher up the chain.
          </li>
        </ol>
        <div className="pt-2 flex justify-end gap-3">
          <button
            onClick={onDismiss}
            className="px-4 py-2 rounded bg-accent text-white text-sm font-medium hover:opacity-90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ImageListPage() {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTutorial, setShowTutorial] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(TUTORIAL_LS_KEY);
    } catch {
      return true;
    }
  });

  useEffect(() => {
    api.images().then((rows) => {
      setImages(rows);
      setLoading(false);
    });
  }, []);

  const groups = useMemo(() => groupImages(images), [images]);
  const phaseInfo = useMemo(() => currentGlobalPhase(groups), [groups]);

  const pagesComplete = useMemo(
    () => groups.filter((g) => isPhaseCompleteForPage(g, phaseInfo.phase)).length,
    [groups, phaseInfo.phase],
  );

  function dismissTutorial() {
    try {
      localStorage.setItem(TUTORIAL_LS_KEY, "1");
    } catch {}
    setShowTutorial(false);
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-zinc-500">Loading…</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="rounded border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
          No images yet. Run <code className="text-zinc-300">scripts/push_all_viewports_to_annotool.sh</code> in the leblanc repo.
        </div>
      </div>
    );
  }

  return (
    <>
      {showTutorial && <Tutorial onDismiss={dismissTutorial} />}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setShowTutorial(true)}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            ? How to review
          </button>
        </div>
        <PhaseBanner
          phaseIndex={phaseInfo.index}
          phase={phaseInfo.phase}
          done={phaseInfo.done}
          pagesComplete={pagesComplete}
          pagesTotal={groups.length}
        />
        <div className="space-y-5">
          {groups.map((g) => (
            <PageCard
              key={g.base}
              group={g}
              globalPhase={phaseInfo.phase}
              globalPhaseIndex={phaseInfo.index}
            />
          ))}
        </div>
      </div>
    </>
  );
}
