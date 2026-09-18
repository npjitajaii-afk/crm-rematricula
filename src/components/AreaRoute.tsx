import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Area } from "../types";
import { temAcessoArea } from "../utils/areaAccess";

interface AreaRouteProps {
  area: Area;
  children: React.ReactNode;
}

/**
 * Creator e admin: acesso a todas as áreas (igual is_admin no banco).
 * Supervisor/colaborador: só se a área estiver em areasPermitidas.
 */
const AreaRoute: React.FC<AreaRouteProps> = ({ area, children }) => {
  const { user } = useAuth();

  if (!temAcessoArea(user, area)) {
    return <Navigate to="/minha-area" replace />;
  }

  return <>{children}</>;
};

export default AreaRoute;
