import { useEffect, useState } from "react";
import { InvoiceRow, Me, api, fmtHMS, fmtMoney } from "../lib/api";

export default function InvoicesPage({ me }: { me: Me }) {
  const [invs, setInvs] = useState<InvoiceRow[]>([]);
  const [busy, setBusy] = useState(false);

  function reload() {
    api.invoices().then(setInvs);
  }

  useEffect(() => {
    reload();
  }, []);

  async function generate() {
    setBusy(true);
    try {
      await api.generatePreviousWeek();
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function runAll() {
    setBusy(true);
    try {
      await api.runWeeklyCron();
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={generate}
            className="px-3 py-1.5 rounded border border-zinc-700 text-sm hover:bg-zinc-900"
          >
            {busy ? "…" : "Generate my prev-week invoice"}
          </button>
          {me.is_admin && (
            <button
              disabled={busy}
              onClick={runAll}
              className="px-3 py-1.5 rounded bg-accent text-white text-sm hover:opacity-90"
            >
              {busy ? "…" : "Generate weekly for ALL users"}
            </button>
          )}
        </div>
      </div>

      {invs.length === 0 ? (
        <div className="rounded border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
          No invoices yet. Click <em>Generate my prev-week invoice</em>.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              {me.is_admin && <th className="py-2">User</th>}
              <th className="py-2">Period</th>
              <th className="py-2 text-right">Hours</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Amount</th>
              <th className="py-2 text-right">PDF</th>
            </tr>
          </thead>
          <tbody>
            {invs.map((i) => (
              <tr key={i.id} className="border-t border-zinc-800">
                {me.is_admin && (
                  <td className="py-2 text-zinc-300">
                    {i.user_name || i.user_email}
                  </td>
                )}
                <td className="py-2">
                  {i.period_start.slice(0, 10)} → {i.period_end.slice(0, 10)}
                </td>
                <td className="py-2 text-right">{fmtHMS(i.total_seconds)}</td>
                <td className="py-2 text-right">{fmtMoney(i.hourly_rate_cents)}/h</td>
                <td className="py-2 text-right font-medium">{fmtMoney(i.total_cents)}</td>
                <td className="py-2 text-right">
                  <a
                    href={api.invoicePdfUrl(i.id)}
                    className="underline text-zinc-300 hover:text-white"
                    target="_blank"
                    rel="noreferrer"
                  >
                    download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
