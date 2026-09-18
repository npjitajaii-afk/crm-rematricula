import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

interface GestorRouteProps {
  children: React.ReactNode;
}

/** Creator, admin ou supervisor — telas de gestão. */
const GestorRoute: React.FC<GestorRouteProps> = ({ children }) => {
  const { user } = useAuth();
  const role = user?.role;

  if (role !== "creator" && role !== "admin" && role !== "supervisor") {
    return <Navigate to="/minha-area" replace />;
  }

  return <>{children}</>;
};

export default GestorRoute;
