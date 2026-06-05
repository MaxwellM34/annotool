import { Me, StorageStatus } from "../lib/api";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function StorageFullPage({
  me,
  status,
}: {
  me: Me;
  status: StorageStatus;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg w-full bg-zinc-900 border border-red-900/60 rounded-lg p-8">
        <div className="text-red-400 text-sm font-medium mb-2">Storage full</div>
        <h1 className="text-2xl font-semibold mb-3">
          {me.is_admin ? "Please increase storage" : "Please tell your admin to increase storage"}
        </h1>
        <p className="text-zinc-300 text-sm mb-6">
          The annotation database is at <span className="font-semibold">{status.percent_used.toFixed(1)}%</span> of its
          capacity. New annotations and image uploads are paused until storage is increased.
        </p>

        <div className="rounded border border-zinc-800 bg-zinc-950 p-4 mb-6 text-sm">
          <div className="flex justify-between text-zinc-400 mb-2">
            <span>Used</span>
            <span>{fmtBytes(status.used_bytes)} / {fmtBytes(status.limit_bytes)}</span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded overflow-hidden">
            <div
              className="h-full bg-red-500"
              style={{ width: `${Math.min(100, status.percent_used)}%` }}
            />
          </div>
        </div>

        {me.is_admin ? (
          <div className="text-sm text-zinc-300 space-y-3">
            <p className="font-medium">How to fix it:</p>
            <ol className="list-decimal list-inside space-y-1 text-zinc-400">
              <li>
                Go to <a className="underline" href="https://console.neon.tech" target="_blank" rel="noreferrer">console.neon.tech</a> → your project → <b>Plans</b>.
              </li>
              <li>Upgrade to a paid plan (or buy add-on storage) so the database has more headroom.</li>
              <li>
                Optional cleanup instead: in the annotool Admin page (once unlocked), delete old comparison images you no longer need.
              </li>
            </ol>
            <p className="text-xs text-zinc-500 pt-2">
              You can override the storage limit by setting <code>STORAGE_LIMIT_BYTES</code> in the Render dashboard
              if you've raised the Neon limit.
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            Read-only access stays available — you can still review past annotations and download invoices.
          </p>
        )}

        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 rounded border border-zinc-700 text-sm hover:bg-zinc-800"
        >
          Recheck
        </button>
      </div>
    </div>
  );
}
