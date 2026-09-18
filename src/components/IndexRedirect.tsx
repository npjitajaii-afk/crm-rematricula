import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/** Creator e admin vão ao dashboard; demais à Minha área. */
const IndexRedirect: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role;
  const destino =
    role === "creator" || role === "admin" ? "/dashboard" : "/minha-area";
  return <Navigate to={destino} replace />;
};

export default IndexRedirect;
