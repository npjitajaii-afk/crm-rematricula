import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AlunosProvider } from "./contexts/AlunosContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ConfirmProvider } from "./contexts/ConfirmContext";
import { NotificacoesProvider } from "./contexts/NotificacoesContext";
import { ChecklistProvider } from "./contexts/ChecklistContext";
import { WhatsappProvider } from "./contexts/WhatsappContext";
import { TarefasEngajamentoProvider } from "./contexts/TarefasEngajamentoContext";
import { AgendaEngajamentoProvider } from "./contexts/AgendaEngajamentoContext";
import PrivateRoute from "./components/PrivateRoute";
import AreaRoute from "./components/AreaRoute";
import AdminRoute from "./components/AdminRoute";
import IndexRedirect from "./components/IndexRedirect";
import Layout from "./components/Layout";

const Login              = lazy(() => import("./pages/Login"));
const Register           = lazy(() => import("./pages/Register"));
const Dashboard           = lazy(() => import("./pages/Dashboard"));
const Alunos              = lazy(() => import("./pages/Alunos"));
const MeusContatos        = lazy(() => import("./pages/MeusContatos"));
const RiscoEvasao         = lazy(() => import("./pages/RiscoEvasao"));
const MetricasDashboard   = lazy(() => import("./pages/MetricasDashboard"));
const Grupos              = lazy(() => import("./pages/Grupos"));
const Colaboradores       = lazy(() => import("./pages/Colaboradores"));
const Usuarios            = lazy(() => import("./pages/Usuarios"));
const Retencao            = lazy(() => import("./pages/Retencao"));
const Engajamento         = lazy(() => import("./pages/Engajamento"));
const MeusContatosEngajamento = lazy(() => import("./pages/MeusContatosEngajamento"));
const TarefasEngajamento = lazy(() => import("./pages/TarefasEngajamento"));
const AgendaEngajamento = lazy(() => import("./pages/AgendaEngajamento"));
const CalendarioGeral = lazy(() => import("./pages/CalendarioGeral"));
const PainelTarefasGeral = lazy(() => import("./pages/PainelTarefasGeral"));
const AlunoDetails        = lazy(() => import("./pages/AlunoDetails"));
const AlunoForm           = lazy(() => import("./pages/AlunoForm"));
const MinhaArea           = lazy(() => import("./pages/MinhaArea"));

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <AlunosProvider>
              <NotificacoesProvider>
              <ChecklistProvider>
              <WhatsappProvider>
                <TarefasEngajamentoProvider>
                <AgendaEngajamentoProvider>
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
                      <Route index element={<IndexRedirect />} />

                      {/* Funil de Rematrícula: "Alunos", "Meus Contatos" e "Risco de
                          Evasão" agora são abas dentro da mesma seção "Rematrícula" na
                          sidebar (ver RematriculaTabs.tsx e Layout.tsx), então as três
                          seguem a mesma regra de acesso: liberado pra admin e pra
                          colaborador com a área "rematricula" liberada. As demais
                          rotas seguem como estavam:
                            dashboard      -> AdminRoute
                            alunos         -> AreaRoute area="rematricula"
                            meus-contatos  -> AreaRoute area="rematricula"
                            risco-evasao   -> AreaRoute area="rematricula"
                            metricas       -> AdminRoute
                            grupos         -> AdminRoute
                            colaboradores  -> AdminRoute
                            usuarios       -> AdminRoute */}
                      <Route path="dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
                      <Route path="alunos" element={<AreaRoute area="rematricula"><Alunos /></AreaRoute>} />
                      <Route path="meus-contatos" element={<AreaRoute area="rematricula"><MeusContatos /></AreaRoute>} />
                      <Route path="risco-evasao" element={<AreaRoute area="rematricula"><RiscoEvasao /></AreaRoute>} />
                      <Route path="rematricula/tarefas" element={<AreaRoute area="rematricula"><TarefasEngajamento area="rematricula" /></AreaRoute>} />
                      <Route path="rematricula/agenda" element={<AreaRoute area="rematricula"><AgendaEngajamento area="rematricula" /></AreaRoute>} />
                      <Route path="rematricula/calendario" element={<AreaRoute area="rematricula"><CalendarioGeral /></AreaRoute>} />
                      <Route path="rematricula/painel-tarefas" element={<AreaRoute area="rematricula"><PainelTarefasGeral /></AreaRoute>} />
                      <Route path="metricas" element={<AdminRoute><MetricasDashboard /></AdminRoute>} />
                      <Route path="grupos" element={<AdminRoute><Grupos /></AdminRoute>} />
                      <Route path="colaboradores" element={<AdminRoute><Colaboradores /></AdminRoute>} />
                      <Route path="usuarios" element={<AdminRoute><Usuarios /></AdminRoute>} />

                      {/* Compatibilidade: quem tiver /funil-rematricula salvo cai no dashboard. */}
                      <Route path="funil-rematricula" element={<Navigate to="/dashboard" replace />} />

                      {/* Fora do Funil de Rematrícula: telas de detalhe/formulário (não
                          são abas, são um drill-down a partir do Kanban) e os outros 2
                          funis (Retenção/Engajamento), que continuam como rotas próprias
                          — não fazem parte do Funil de Rematrícula. */}
                      <Route path="alunos/new" element={<AreaRoute area="rematricula"><AlunoForm /></AreaRoute>} />
                      <Route path="alunos/:id" element={<AlunoDetails />} />
                      <Route path="alunos/:id/edit" element={<AlunoForm />} />
                      <Route path="retencao" element={<AreaRoute area="retencao"><Retencao /></AreaRoute>} />
                      <Route path="retencao/novo" element={<AreaRoute area="retencao"><AlunoForm /></AreaRoute>} />
                      <Route path="engajamento" element={<AreaRoute area="engajamento"><Engajamento /></AreaRoute>} />
                      {/* Engajamento ganhou abas iguais à Rematrícula, exceto Risco de
                          Evasão: "Alunos" (rota já existente acima) e "Meus Contatos"
                          (ver EngajamentoTabs.tsx e MeusContatosEngajamento.tsx). */}
                      <Route path="engajamento/meus-contatos" element={<AreaRoute area="engajamento"><MeusContatosEngajamento /></AreaRoute>} />
                      <Route path="engajamento/tarefas" element={<AreaRoute area="engajamento"><TarefasEngajamento /></AreaRoute>} />
                      <Route path="engajamento/agenda" element={<AreaRoute area="engajamento"><AgendaEngajamento /></AreaRoute>} />
                      <Route path="engajamento/calendario" element={<AreaRoute area="engajamento"><CalendarioGeral /></AreaRoute>} />
                      <Route path="engajamento/painel-tarefas" element={<AreaRoute area="engajamento"><PainelTarefasGeral /></AreaRoute>} />
                      <Route path="engajamento/novo" element={<AreaRoute area="engajamento"><AlunoForm /></AreaRoute>} />
                      <Route path="minha-area" element={<MinhaArea />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
                </AgendaEngajamentoProvider>
                </TarefasEngajamentoProvider>
              </WhatsappProvider>
              </ChecklistProvider>
              </NotificacoesProvider>
            </AlunosProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
