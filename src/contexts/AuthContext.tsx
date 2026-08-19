import React, { useState, useEffect, ReactNode } from "react";
import { User } from "../types";
import {
  loginUser,
  registerUser,
  logoutUser,
  getCurrentUser,
  onAuthStateChange,
} from "../services/authService";
import { AuthContext } from "./auth-context";

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const { user: currentUser } = await getCurrentUser();
      setUser(currentUser);
      setIsLoading(false);
    };

    checkSession();

    // Mantém o usuário sincronizado caso a sessão mude (ex: token expirado)
    const unsubscribe = onAuthStateChange((updatedUser) => {
      setUser(updatedUser);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    const { user: authenticatedUser, error } = await loginUser(
      email,
      password
    );

    if (error) {
      throw new Error(error);
    }

    if (!authenticatedUser) {
      throw new Error("Erro ao fazer login");
    }

    setUser(authenticatedUser);
  };

  const register = async (
    name: string,
    email: string,
    password: string
  ): Promise<void> => {
    const { user: newUser, error } = await registerUser(
      name,
      email,
      password
    );

    if (error === "EMAIL_CONFIRMATION_ENABLED") {
      throw new Error(
        "A confirmação de e-mail ainda está ativa no Supabase. Desative-a para concluir o cadastro sem verificação por e-mail."
      );
    }

    if (error === "PENDING_APPROVAL") {
      return;
    }

    if (error) {
      throw new Error(error);
    }

    if (!newUser) {
      throw new Error("Erro ao registrar usuário");
    }

    setUser(newUser);
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        logout,
        isAuthenticated: user?.status === "aprovado",
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
