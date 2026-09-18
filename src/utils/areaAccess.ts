import { Area, User } from "../types";

/**
 * Regra única de acesso por área (espelha a RLS: tem_acesso_area()).
 * Creator e admin: acesso a todas as áreas.
 * Supervisor/colaborador: só se a área estiver em areasPermitidas.
 */
export function temAcessoArea(user: User | null | undefined, area: Area): boolean {
  const role = user?.role;
  return role === "creator" || role === "admin" || !!user?.areasPermitidas?.includes(area);
}
