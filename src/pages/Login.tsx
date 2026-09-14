import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  LogIn,
  Mail,
  Lock,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  GraduationCap,
} from "lucide-react";
import glowingFishLoader from "../assets/glowing-fish-loader.svg";
import {
  checkLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
  formatAttemptsHint,
} from "../utils/loginRateLimit";
import "./Login.css";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const approvedMessage = (location.state as { message?: string } | null)?.message;

  const refreshLockState = useCallback(async (mail: string) => {
    if (!mail.trim()) {
      setHint(null);
      setLockedUntil(null);
      setLockMessage(null);
      return;
    }
    const check = await checkLoginAllowed(mail);
    if (check.blocked) {
      setLockedUntil(Date.now() + check.remainingMs);
      setLockMessage(check.message);
      setHint(null);
    } else {
      setLockedUntil(null);
      setLockMessage(null);
      setHint(formatAttemptsHint(check.attemptsLeft));
    }
  }, []);

  // Ao digitar e-mail, consulta o servidor (debounce leve)
  useEffect(() => {
    if (!email.trim()) {
      setHint(null);
      setLockedUntil(null);
      setLockMessage(null);
      return;
    }
    const t = setTimeout(() => {
      void refreshLockState(email);
    }, 400);
    return () => clearTimeout(t);
  }, [email, refreshLockState]);

  // Contador regressivo na UI enquanto bloqueado
  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => {
      if (Date.now() >= lockedUntil) {
        setLockedUntil(null);
        setLockMessage(null);
        setError("");
        void refreshLockState(email);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil, email, refreshLockState]);

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Por favor, preencha todos os campos");
      return;
    }

    const allowed = await checkLoginAllowed(email);
    if (allowed.blocked) {
      setLockedUntil(Date.now() + allowed.remainingMs);
      setLockMessage(allowed.message);
      setError(allowed.message);
      return;
    }

    setIsLoading(true);

    try {
      await login(email, password);
      await clearLoginFailures(email);
      navigate("/", { replace: true });
    } catch (err) {
      const fail = await recordLoginFailure(email);
      if (fail.blocked) {
        setLockedUntil(Date.now() + fail.remainingMs);
        setLockMessage(fail.message);
        setError(fail.message);
        setHint(null);
      } else {
        const base =
          err instanceof Error ? err.message : "Erro ao fazer login";
        setError(base);
        setHint(formatAttemptsHint(fail.attemptsLeft));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-glow-bg" aria-hidden="true">
        <img src={glowingFishLoader} alt="" />
      </div>

      <div className="login-card">
        <div className="login-header">
          <div className="login-brand">
            <GraduationCap size={15} />
            Bask CRM
          </div>
          <div className="login-icon">
            <LogIn size={32} />
          </div>
          <h1>Bem-vindo de volta</h1>
          <p>Acesse sua central de relacionamento com alunos.</p>
        </div>

        {(error || lockMessage) && (
          <div className="error-message">
            <AlertCircle size={20} />
            <span>{lockMessage || error}</span>
          </div>
        )}
        {!error && !lockMessage && hint && (
          <div
            className="error-message"
            style={{
              background: "rgba(234, 179, 8, 0.12)",
              borderColor: "rgba(234, 179, 8, 0.35)",
            }}
          >
            <AlertCircle size={20} />
            <span>{hint}</span>
          </div>
        )}
        {approvedMessage && (
          <div className="login-success-message" role="status">
            {approvedMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">
              <Mail size={18} />
              E-mail
            </label>
            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading || isLocked}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              <Lock size={18} />
              Senha
            </label>
            <div className="password-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading || isLocked}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                disabled={isLoading || isLocked}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg w-full"
            disabled={isLoading || isLocked}
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="spin" />
                Entrando...
              </>
            ) : isLocked ? (
              <>
                <Lock size={20} />
                Bloqueado temporariamente
              </>
            ) : (
              <>
                <LogIn size={20} />
                Entrar
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>
            Não tem uma conta?{" "}
            <Link to="/register" className="link">
              Cadastre-se
            </Link>
          </p>
          <span className="login-security-note">
            Acesso seguro e exclusivo para usuários autorizados
          </span>
        </div>
      </div>
    </div>
  );
};

export default Login;
