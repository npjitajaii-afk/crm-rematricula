import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Area } from "../types";

interface AreaRouteProps {
  area: Area;
  children: React.ReactNode;
}

// Admin sempre passa. Colaborador só passa se a área estiver liberada em
// user.areasPermitidas (definido pelo admin na tela de Usuários).
const AreaRoute: React.FC<AreaRouteProps> = ({ area, children }) => {
  const { user } = useAuth();

  const temAcesso = user?.role === "admin" || !!user?.areasPermitidas?.includes(area);

  if (!temAcesso) {
    return <Navigate to="/minha-area" replace />;
  }

  return <>{children}</>;
};

export default AreaRoute;
