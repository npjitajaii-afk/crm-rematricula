import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

interface AdminRouteProps {
  children: React.ReactNode;
}

/** Creator (global) ou admin (polo) — telas de gestão administrativa. */
const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user } = useAuth();
  const role = user?.role;

  if (role !== "creator" && role !== "admin") {
    return <Navigate to="/minha-area" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
