import { useEffect, useState } from "react";
import { TrackingSummary, api, fmtHMS, fmtMoney } from "../lib/api";

export default function HoursPage() {
  const [s, setS] = useState<TrackingSummary | null>(null);

  useEffect(() => {
    api.summary().then(setS);
    const id = window.setInterval(() => api.summary().then(setS), 10_000);
    return () => window.clearInterval(id);
  }, []);

  if (!s) return <div className="p-8 text-zinc-500">Loading…</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold mb-6">Your hours</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Stat label="Today" seconds={s.today_seconds} rate={s.hourly_rate_cents} />
        <Stat label="This week" seconds={s.this_week_seconds} rate={s.hourly_rate_cents} />
        <Stat label="Last week" seconds={s.last_week_seconds} rate={s.hourly_rate_cents} />
      </div>

      <h2 className="text-lg font-medium mb-3">This week, by day</h2>
      {s.this_week_days.length === 0 ? (
        <p className="text-zinc-500">No tracked time yet this week.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-2">Date</th>
              <th className="py-2 text-right">Time</th>
              <th className="py-2 text-right">Pay</th>
            </tr>
          </thead>
          <tbody>
            {s.this_week_days.map((d) => (
              <tr key={d.date} className="border-t border-zinc-800">
                <td className="py-2">{d.date}</td>
                <td className="py-2 text-right">{fmtHMS(d.seconds)}</td>
                <td className="py-2 text-right text-zinc-300">
                  {fmtMoney(Math.round((d.seconds / 3600) * s.hourly_rate_cents))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, seconds, rate }: { label: string; seconds: number; rate: number }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-zinc-500 text-sm">{label}</div>
      <div className="text-2xl font-semibold mt-1">{fmtHMS(seconds)}</div>
      <div className="text-zinc-400 text-xs mt-1">
        {fmtMoney(Math.round((seconds / 3600) * rate))} @ {fmtMoney(rate)}/h
      </div>
    </div>
  );
}
