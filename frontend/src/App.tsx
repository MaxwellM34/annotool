import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ApiError, Me, api } from "./lib/api";
import Layout from "./components/Layout";
import LoginPage from "./components/LoginPage";
import ImageListPage from "./components/ImageListPage";
import AnnotatorPage from "./components/AnnotatorPage";
import HoursPage from "./components/HoursPage";
import InvoicesPage from "./components/InvoicesPage";
import AdminPage from "./components/AdminPage";

export default function App() {
  const [me, setMe] = useState<Me | null | "loading">("loading");

  useEffect(() => {
    api.me().then(setMe).catch((e: ApiError) => {
      if (e.status === 401) setMe(null);
      else setMe(null);
    });
  }, []);

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
