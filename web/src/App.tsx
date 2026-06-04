import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./components/Toast";
import { ConfigProvider } from "./lib/config";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Reminders } from "./pages/Reminders";
import { Channels } from "./pages/Channels";
import { Automations } from "./pages/Automations";
import { Activity } from "./pages/Activity";
import { Settings } from "./pages/Settings";
import { Spinner } from "./components/ui";

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

function Gate() {
  const { authed, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!authed) return <Login />;

  return (
    <ConfigProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="reminders" element={<Reminders />} />
            <Route path="channels" element={<Channels />} />
            <Route path="automations" element={<Automations />} />
            <Route path="activity" element={<Activity />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}
