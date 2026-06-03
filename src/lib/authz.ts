export type Role = "USER" | "ADMIN";

export function isAdmin(role: Role): boolean {
  return role === "ADMIN";
}

export function canAccessAdminArea(role: Role): boolean {
  return isAdmin(role);
}
