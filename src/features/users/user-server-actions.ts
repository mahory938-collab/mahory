import { createServerFn } from "@tanstack/react-start";

type AppRole = "super_admin" | "admin" | "vendedor";
const VALID_ROLES: AppRole[] = ["super_admin", "admin", "vendedor"];

async function requireAdmin(accessToken: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(accessToken);
  if (callerError || !callerData.user) throw new Error("Sesión inválida. Inicie sesión nuevamente.");

  const { data: callerRoles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerData.user.id);
  const isAdmin = (callerRoles ?? []).some((r) => r.role === "admin" || r.role === "super_admin");
  if (!isAdmin) throw new Error("No tiene permisos para administrar usuarios");

  const callerIsSuper = (callerRoles ?? []).some((r) => r.role === "super_admin");
  return { supabaseAdmin, caller: callerData.user, callerIsSuper };
}

/** Creates a login (auth.users) + profile + role for a new team member. Admin-only. */
export const createUserAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as {
    accessToken: string;
    email: string;
    password: string;
    fullName: string;
    role: AppRole;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await requireAdmin(data.accessToken);

    if (!VALID_ROLES.includes(data.role)) throw new Error("Rol inválido");
    if (data.password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createError) throw new Error(createError.message);

    const userId = created.user.id;

    // The on_auth_user_created trigger already inserted a profile + a default
    // "vendedor" role row — align them with what the admin actually picked.
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .update({ role: data.role })
      .eq("user_id", userId);
    if (roleError) throw new Error(roleError.message);

    return { id: userId };
  });

/** Replaces a user's role. Admin-only. */
export const updateUserRoleAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { accessToken: string; userId: string; role: AppRole })
  .handler(async ({ data }) => {
    const { supabaseAdmin, caller, callerIsSuper } = await requireAdmin(data.accessToken);

    if (!VALID_ROLES.includes(data.role)) throw new Error("Rol inválido");
    if (data.userId === caller.id) throw new Error("No puede cambiar su propio rol");

    // Dar o quitar el rol de Super Administrador es solo de un Super Administrador.
    if (!callerIsSuper) {
      const { data: targetRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId);
      const targetIsSuper = (targetRoles ?? []).some((r) => r.role === "super_admin");
      if (data.role === "super_admin" || targetIsSuper) {
        throw new Error("Solo un Super Administrador puede cambiar ese rol.");
      }
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .update({ role: data.role })
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
  });

/**
 * Permanently deletes a login. Admin-only, and blocked for anyone who has
 * ever opened a cash session or rung up a sale — cash_sessions.user_id
 * cascade-deletes on user removal, which would wipe caja history. Deactivate
 * (profiles.is_active) is the safe path for accounts with any activity.
 */
export const deleteUserAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { accessToken: string; userId: string })
  .handler(async ({ data }) => {
    const { supabaseAdmin, caller } = await requireAdmin(data.accessToken);

    if (data.userId === caller.id) throw new Error("No puede eliminar su propia cuenta");

    const [sessionsRes, salesRes] = await Promise.all([
      supabaseAdmin
        .from("cash_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", data.userId),
      supabaseAdmin
        .from("sales")
        .select("id", { count: "exact", head: true })
        .eq("cashier_id", data.userId),
    ]);
    if ((sessionsRes.count ?? 0) > 0 || (salesRes.count ?? 0) > 0) {
      throw new Error(
        "Este usuario ya registró ventas o turnos de caja — no se puede eliminar sin perder ese historial. Desactívelo en su lugar.",
      );
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
  });

/**
 * Edita los datos de una cuenta: nombre, correo (con el que inicia sesión), teléfono y, solo si
 * se escribe, una contraseña nueva. Solo administradores; los datos de un Super Administrador
 * (incluida su contraseña) solo los cambia otro Super Administrador (o él mismo).
 */
export const updateUserAccount = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        accessToken: string;
        userId: string;
        fullName: string;
        email: string;
        phone: string;
        password?: string;
      },
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, caller, callerIsSuper } = await requireAdmin(data.accessToken);

    const fullName = data.fullName.trim();
    const email = data.email.trim().toLowerCase();
    const phone = data.phone.trim();
    const password = data.password ? data.password : undefined;

    if (fullName.length < 2) throw new Error("Escriba el nombre.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("El correo no es válido.");
    if (phone.length > 30) throw new Error("El teléfono es demasiado largo.");
    if (password !== undefined && password.length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres");
    }

    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const targetIsSuper = (targetRoles ?? []).some((r) => r.role === "super_admin");
    if (targetIsSuper && !callerIsSuper && data.userId !== caller.id) {
      throw new Error("Solo un Super Administrador puede modificar a otro Super Administrador.");
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      ...(password ? { password } : {}),
    });
    if (authError) {
      throw new Error(
        /already|registered|exists/i.test(authError.message)
          ? "Ya existe otra cuenta con ese correo."
          : authError.message,
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: fullName, email, phone: phone || null })
      .eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);
  });
