/**
 * Role & permission model.
 * Roles are stored in the `user_roles` table (never on the profile).
 */

export type AppRole = "super_admin" | "admin" | "vendedor";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Administrador",
  admin: "Administrador",
  vendedor: "Vendedor",
};

export type Permission =
  | "dashboard.view"
  | "pos.use"
  | "pos.edit_price"
  | "pos.discount"
  | "pos.cancel_sale"
  | "products.view"
  | "products.manage"
  | "products.import"
  | "inventory.view"
  | "inventory.adjust"
  | "purchases.view"
  | "purchases.manage"
  | "customers.view"
  | "customers.manage"
  | "suppliers.view"
  | "suppliers.manage"
  | "cash.use"
  | "cash.close_any"
  | "reports.view"
  | "settings.manage"
  | "users.manage"
  | "promotions.manage"
  | "stores.manage"
  | "categories.manage"
  | "expenses.manage";

const VENDEDOR: Permission[] = ["pos.use", "customers.view", "customers.manage", "cash.use"];

const ADMIN: Permission[] = [
  ...VENDEDOR,
  "dashboard.view",
  "pos.edit_price",
  "pos.discount",
  "pos.cancel_sale",
  "products.view",
  "products.manage",
  "products.import",
  "inventory.view",
  "inventory.adjust",
  "purchases.view",
  "purchases.manage",
  "suppliers.view",
  "suppliers.manage",
  "cash.close_any",
  "reports.view",
  "settings.manage",
  "users.manage",
  "promotions.manage",
  "stores.manage",
  "categories.manage",
  "expenses.manage",
];

export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  vendedor: VENDEDOR,
  admin: ADMIN,
  super_admin: ADMIN,
};

export function roleHasPermission(role: AppRole | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}
