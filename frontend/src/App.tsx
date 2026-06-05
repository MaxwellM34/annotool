import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ApiError, Me, StorageStatus, api, setCurrency } from "./lib/api";
import Layout from "./components/Layout";
import LoginPage from "./components/LoginPage";
import ImageListPage from "./components/ImageListPage";
import AnnotatorPage from "./components/AnnotatorPage";
import HoursPage from "./components/HoursPage";
import InvoicesPage from "./components/InvoicesPage";
import AdminPage from "./components/AdminPage";
import StorageFullPage from "./components/StorageFullPage";

export default function App() {
  const [me, setMe] = useState<Me | null | "loading">("loading");
  const [storage, setStorage] = useState<StorageStatus | null>(null);

  useEffect(() => {
    api.me().then((u) => {
      setMe(u);
      // Currency + storage are only readable when authed.
      api.systemInfo().then((info) => setCurrency(info.currency_symbol, info.currency_code)).catch(() => {});
      api.storage().then(setStorage).catch(() => {});
    }).catch((e: ApiError) => {
      if (e.status === 401) setMe(null);
      else setMe(null);
    });
  }, []);

  // Recheck storage periodically (every 60s) so an admin who frees space sees the gate lift.
  useEffect(() => {
    if (!me || me === "loading") return;
    const id = window.setInterval(() => {
      api.storage().then(setStorage).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(id);
  }, [me]);

  if (me === "loading") {
    return <div className="flex h-full items-center justify-center text-zinc-400">loading…</div>;
  }
  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  if (storage?.locked) {
    return <StorageFullPage me={me} status={storage} />;
  }
  return (
    <Routes>
      <Route element={<Layout me={me} />}>
        <Route path="/" element={<ImageListPage />} />
        <Route path="/annotate/:imageId" element={<AnnotatorPage />} />
        <Route path="/hours" element={<HoursPage />} />
        <Route path="/invoices" element={<InvoicesPage me={me} />} />
        {me.is_admin && <Route path="/admin" element={<AdminPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
