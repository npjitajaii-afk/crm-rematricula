import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AlunosProvider } from "./contexts/AlunosContext";
import PrivateRoute from "./components/PrivateRoute";
import Layout from "./components/Layout";
import AdminRoute from "./components/AdminRoute";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Alunos = lazy(() => import("./pages/Alunos"));
const AlunoDetails = lazy(() => import("./pages/AlunoDetails"));
const AlunoForm = lazy(() => import("./pages/AlunoForm"));
const MinhaArea = lazy(() => import("./pages/MinhaArea"));
const Colaboradores = lazy(() => import("./pages/Colaboradores"));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AlunosProvider>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/login" element={<Login />} />
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
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="minha-area" element={<MinhaArea />} />
                <Route path="alunos" element={<Alunos />} />
                <Route path="alunos/new" element={<AlunoForm />} />
                <Route path="alunos/:id" element={<AlunoDetails />} />
                <Route path="alunos/:id/edit" element={<AlunoForm />} />
                <Route
                  path="colaboradores"
                  element={
                    <AdminRoute>
                      <Colaboradores />
                    </AdminRoute>
                  }
                />
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </AlunosProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
