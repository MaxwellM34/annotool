import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Device emulator preview.
//
// The annotator stores a side-by-side image: Figma on the left half, real
// staging render on the right half. The "preview on device" panel crops to
// the right half (CSS clip-path) and shows it inside a bezel sized to match
// the real device viewport. The reviewer sees roughly how the page will look
// on an actual phone / tablet / monitor.
//
// Annotations are still drawn on the main canvas — this panel is purely
// reference.
// ---------------------------------------------------------------------------

export type Viewport = "375" | "414" | "768" | "1024" | "1440" | "1920";

const ALL_VIEWPORTS: Viewport[] = ["375", "414", "768", "1024", "1440", "1920"];

export function parseSlugViewport(slug: string): { base: string; viewport: Viewport | null } {
  const m = slug.match(/^(.*)-(\d{3,4})$/);
  if (m && ALL_VIEWPORTS.includes(m[2] as Viewport)) {
    return { base: m[1], viewport: m[2] as Viewport };
  }
  return { base: slug, viewport: null };
}

type DeviceMeta = {
  kind: "phone" | "tablet" | "desktop";
  label: string;
  // The bezel inner viewport size we draw in CSS pixels (scaled down for
  // visibility; we keep aspect realistic but cap so it fits on screen).
  innerWidth: number;
  innerHeight: number;
  // Bezel cosmetic spec.
  bezel: { width: number; radius: number; color: string };
  // Notch / camera / home button rendering hints.
  hasNotch?: boolean;
};

const DEVICE_BY_VIEWPORT: Record<Viewport, DeviceMeta> = {
  "375": {
    kind: "phone",
    label: "iPhone Mini (375 × 812)",
    innerWidth: 320,
    innerHeight: 693,
    bezel: { width: 14, radius: 44, color: "#0a0a0a" },
    hasNotch: true,
  },
  "414": {
    kind: "phone",
    label: "iPhone Plus / Pro Max (414 × 896)",
    innerWidth: 340,
    innerHeight: 736,
    bezel: { width: 14, radius: 48, color: "#0a0a0a" },
    hasNotch: true,
  },
  "768": {
    kind: "tablet",
    label: "iPad portrait (768 × 1024)",
    innerWidth: 420,
    innerHeight: 560,
    bezel: { width: 18, radius: 24, color: "#0a0a0a" },
  },
  "1024": {
    kind: "tablet",
    label: "iPad landscape / small laptop (1024 × 768)",
    innerWidth: 560,
    innerHeight: 420,
    bezel: { width: 18, radius: 24, color: "#0a0a0a" },
  },
  "1440": {
    kind: "desktop",
    label: "Standard desktop (1440 × 900)",
    innerWidth: 720,
    innerHeight: 450,
    bezel: { width: 12, radius: 12, color: "#1a1a1a" },
  },
  "1920": {
    kind: "desktop",
    label: "Wide desktop (1920 × 1080)",
    innerWidth: 780,
    innerHeight: 440,
    bezel: { width: 12, radius: 12, color: "#1a1a1a" },
  },
};

export function DevicePreview({
  imageUrl,
  viewport,
  onClose,
}: {
  imageUrl: string;
  viewport: Viewport;
  onClose: () => void;
}) {
  const meta = DEVICE_BY_VIEWPORT[viewport];
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageUrl;
  }, [imageUrl]);

  // The sxs is structured: left=Figma, right=render, total width ≈ left.width + gap + right.width
  // Both halves are equal width (we resized in the push script). So the render half is the right 50%.
  // We compute the scaled image size so the render half exactly fills the device inner width.
  let imgStyle: React.CSSProperties = { display: "block" };
  if (naturalSize) {
    const halfWidth = naturalSize.w / 2; // approximate (gap is small)
    const scale = meta.innerWidth / halfWidth;
    imgStyle = {
      display: "block",
      width: naturalSize.w * scale,
      height: naturalSize.h * scale,
      // Shift left by half image width + half-gap so right edge of viewport sits on the right half's right edge.
      marginLeft: -(halfWidth * scale),
    };
  }

  const outerW = meta.innerWidth + meta.bezel.width * 2;
  const outerH = meta.innerHeight + meta.bezel.width * 2 + (meta.kind === "phone" ? 6 : 0);

  return (
    <div className="fixed inset-0 z-40 bg-black/80 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-zinc-900 border border-zinc-700 rounded-lg p-5 mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="font-semibold">
            {meta.kind === "phone" ? "📱" : meta.kind === "tablet" ? "📲" : "💻"} {meta.label}
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white text-sm"
            aria-label="Close preview"
          >
            ✕ Close
          </button>
        </div>
        <p className="text-sm text-zinc-400">
          This is roughly how the page will look on the real device. Scroll the frame to walk the page. <strong className="text-zinc-200">Draw your annotations on the main image to the left</strong>, not on this preview.
        </p>
      </div>

      <div
        className="relative bg-black flex items-start justify-center overflow-hidden"
        style={{
          width: outerW,
          height: outerH,
          background: meta.bezel.color,
          borderRadius: meta.bezel.radius,
          padding: meta.bezel.width,
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        }}
      >
        {meta.hasNotch && (
          <div
            className="absolute z-10"
            style={{
              top: meta.bezel.width + 4,
              left: "50%",
              transform: "translateX(-50%)",
              width: 90,
              height: 18,
              background: "#000",
              borderRadius: 12,
            }}
          />
        )}
        <div
          className="relative overflow-y-auto overflow-x-hidden bg-white"
          style={{
            width: meta.innerWidth,
            height: meta.innerHeight,
            borderRadius: meta.bezel.radius - meta.bezel.width,
          }}
        >
          {!naturalSize ? (
            <div className="p-4 text-xs text-zinc-500">Loading…</div>
          ) : (
            <img src={imageUrl} alt="device preview" style={imgStyle} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Heads up about stretched screenshots" reminder modal.
// Pops every time the user opens an image (keyed by image id).
// ---------------------------------------------------------------------------

export function StretchReminder({
  viewport,
  onDismiss,
}: {
  viewport: Viewport | null;
  onDismiss: () => void;
}) {
  const isMobile = viewport === "375" || viewport === "414";
  const isTablet = viewport === "768" || viewport === "1024";
  const deviceWord = isMobile ? "phone" : isTablet ? "tablet" : "desktop";

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-zinc-900 border border-zinc-700 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">Heads up — some renders look stretched</h2>
        <p className="text-sm text-zinc-300 leading-relaxed">
          Some pages get visually stretched in the side-by-side because the screenshot was captured wider than the {deviceWord}'s real viewport, or because the Figma reference is a different size than the render. <strong className="text-zinc-100">That's fine.</strong> What matters is whether the page still looks good when it actually loads on the device.
        </p>
        <p className="text-sm text-zinc-300 leading-relaxed">
          Use the <strong className="text-emerald-300">📱 Preview on device</strong> button to see how the page will really appear on a {deviceWord}. Look at that preview to decide whether something needs fixing — then draw your annotation on the main full-size image, since that's where the coordinates are anchored.
        </p>
        <div className="pt-2 flex justify-end">
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
