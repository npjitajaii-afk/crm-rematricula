import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

interface CreatorRouteProps {
  children: React.ReactNode;
}

/** Somente creator — gestão global (ex.: Polos). */
const CreatorRoute: React.FC<CreatorRouteProps> = ({ children }) => {
  const { user } = useAuth();

  if (user?.role !== "creator") {
    return <Navigate to="/minha-area" replace />;
  }

  return <>{children}</>;
};

export default CreatorRoute;
