import { Link, NavLink, Outlet } from "react-router-dom";
import { Me, api } from "../lib/api";

export default function Layout({ me }: { me: Me }) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-6">
          <Link to="/" className="font-semibold text-lg">annotool</Link>
          <nav className="flex gap-4 text-sm text-zinc-300">
            <NavLink to="/" end className={({ isActive }) => isActive ? "text-white" : ""}>Images</NavLink>
            <NavLink to="/hours" className={({ isActive }) => isActive ? "text-white" : ""}>Hours</NavLink>
            <NavLink to="/invoices" className={({ isActive }) => isActive ? "text-white" : ""}>Invoices</NavLink>
            {me.is_admin && (
              <NavLink to="/admin" className={({ isActive }) => isActive ? "text-white" : ""}>Admin</NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-zinc-400">
            {me.picture_url && (
              <img src={me.picture_url} alt="" className="w-7 h-7 rounded-full" />
            )}
            <span>{me.email}</span>
            <button
              onClick={async () => {
                await api.logout().catch(() => null);
                window.location.href = "/login";
              }}
              className="text-zinc-400 hover:text-white"
            >
              sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
