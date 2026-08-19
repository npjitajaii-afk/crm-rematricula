import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const IndexRedirect: React.FC = () => {
  const { user } = useAuth();
  return <Navigate to={user?.role === "admin" ? "/dashboard" : "/minha-area"} replace />;
};

export default IndexRedirect;