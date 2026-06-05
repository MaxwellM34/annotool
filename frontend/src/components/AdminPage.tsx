import { useEffect, useState } from "react";
import { AdminUser, api, fmtHMS, fmtMoney } from "../lib/api";

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [editing, setEditing] = useState<Record<number, number>>({});

  function reload() {
    api.adminUsers().then(setUsers);
  }

  useEffect(() => {
    reload();
  }, []);

  async function save(uid: number) {
    const cents = editing[uid];
    if (cents == null) return;
    await api.setRate(uid, cents);
    setEditing((e) => {
      const next = { ...e };
      delete next[uid];
      return next;
    });
    reload();
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold mb-6">Admin · Users</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-2">User</th>
            <th className="py-2">Email</th>
            <th className="py-2 text-right">Last week</th>
            <th className="py-2 text-right">Rate / hour</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const editVal = editing[u.id];
            const dirty = editVal != null && editVal !== u.hourly_rate_cents;
            return (
              <tr key={u.id} className="border-t border-zinc-800">
                <td className="py-2">
                  {u.name || "(no name)"} {u.is_admin && <span className="text-xs text-emerald-400 ml-1">admin</span>}
                </td>
                <td className="py-2 text-zinc-300">{u.email}</td>
                <td className="py-2 text-right">{fmtHMS(u.last_week_seconds)}</td>
                <td className="py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <span className="text-zinc-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={(u.hourly_rate_cents / 100).toFixed(2)}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [u.id]: Math.round(Number(e.target.value) * 100) || 0,
                        }))
                      }
                      className="w-20 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-right"
                    />
                    <span className="text-zinc-500 text-xs">/h</span>
                  </div>
                </td>
                <td className="py-2 text-right">
                  <button
                    disabled={!dirty}
                    onClick={() => save(u.id)}
                    className="px-3 py-1 rounded border border-zinc-700 text-xs hover:bg-zinc-900 disabled:opacity-30"
                  >
                    Save
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-zinc-500 mt-4">
        Users appear here only after they've signed in at least once via Google (so the allowlist
        check has happened). Current allowlist: <code>ALLOWED_EMAILS</code> env var.
      </p>
    </div>
  );
}
