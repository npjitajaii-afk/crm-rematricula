import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AlunosProvider } from "./contexts/AlunosContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ConfirmProvider } from "./contexts/ConfirmContext";
import { NotificacoesProvider } from "./contexts/NotificacoesContext";
import PrivateRoute from "./components/PrivateRoute";
import Layout from "./components/Layout";

const Login           = lazy(() => import("./pages/Login"));
const Register        = lazy(() => import("./pages/Register"));
const Dashboard       = lazy(() => import("./pages/Dashboard"));
const Alunos          = lazy(() => import("./pages/Alunos"));
const AlunoDetails    = lazy(() => import("./pages/AlunoDetails"));
const AlunoForm       = lazy(() => import("./pages/AlunoForm"));
const MetricasDashboard = lazy(() => import("./pages/MetricasDashboard"));
const RiscoEvasao     = lazy(() => import("./pages/RiscoEvasao"));
const Grupos          = lazy(() => import("./pages/Grupos"));

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <AlunosProvider>
              <NotificacoesProvider>
                <Suspense fallback={null}>
                  <Routes>
                    <Route path="/login"    element={<Login />} />
                    <Route path="/register" element={<Register />} />

                    <Route
                      path="/"
                      element={
                        <PrivateRoute>
                          <Layout />
                        </PrivateRoute>
                      }
                    >
                      <Route index element={<Navigate to="/dashboard" replace />} />
                      <Route path="dashboard"    element={<Dashboard />} />
                      <Route path="alunos"       element={<Alunos />} />
                      <Route path="alunos/new"   element={<AlunoForm />} />
                      <Route path="alunos/:id"   element={<AlunoDetails />} />
                      <Route path="alunos/:id/edit" element={<AlunoForm />} />
                      <Route path="metricas"     element={<MetricasDashboard />} />
                      <Route path="risco-evasao" element={<RiscoEvasao />} />
                      <Route path="grupos"       element={<Grupos />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </Suspense>
              </NotificacoesProvider>
            </AlunosProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;