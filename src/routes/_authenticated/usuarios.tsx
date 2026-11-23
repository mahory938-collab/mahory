import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateUserDialog } from "@/features/users/create-user-dialog";
import { EditUserDialog } from "@/features/users/edit-user-dialog";
import type { AppUser } from "@/features/users/use-users";
import {
  useDeleteUser,
  useToggleUserActive,
  useUpdateUserRole,
  useUsersList,
} from "@/features/users/use-users";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuarios — Mahory" },
      { name: "description", content: "Administre el equipo y sus roles." },
      { property: "og:title", content: "Usuarios — Mahory" },
      { property: "og:description", content: "Administre el equipo y sus roles." },
    ],
  }),
  component: UsuariosPage,
});

function UsuariosPage() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<AppUser | null>(null);
  const [editing, setEditing] = useState<AppUser | null>(null);

  const { data: users, isLoading } = useUsersList();
  const updateRole = useUpdateUserRole();
  const toggleActive = useToggleUserActive();
  const deleteUser = useDeleteUser();

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteUser.mutateAsync(deleting.id);
      toast.success("Usuario eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el usuario");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AppShell
      title="Usuarios"
      description="Usuarios y permisos"
      actions={
        <Button className="h-9 gap-2 rounded-lg" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Nuevo usuario</span>
        </Button>
      }
    >
      <Card className="overflow-hidden rounded-2xl shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              [0, 1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-10 rounded-lg" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && users?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                  No hay usuarios registrados.
                </TableCell>
              </TableRow>
            )}

            {users?.map((account) => {
              const isSelf = account.id === user?.id;
              // Administradores y Super Administradores pueden editarse entre sí; solo se
              // bloquea cambiar el propio rol o eliminarse a uno mismo.
              const canEditRole = !isSelf;
              const canEditData = true;
              return (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.full_name || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {account.email || "—"}
                  </TableCell>
                  <TableCell>
                    {!canEditRole ? (
                      <Badge variant="outline" className="rounded-full">
                        {account.role ? ROLE_LABELS[account.role] : "Sin rol"}
                      </Badge>
                    ) : (
                      <Select
                        value={account.role ?? "vendedor"}
                        onValueChange={(value) =>
                          updateRole.mutate(
                            { userId: account.id, role: value as AppRole },
                            {
                              onSuccess: () => toast.success("Rol actualizado"),
                              onError: (error: Error) =>
                                toast.error(error.message || "No se pudo actualizar el rol"),
                            },
                          )
                        }
                      >
                        <SelectTrigger className="h-9 w-40 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vendedor">{ROLE_LABELS.vendedor}</SelectItem>
                          <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                          <SelectItem value="super_admin">{ROLE_LABELS.super_admin}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(account.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={account.is_active}
                        disabled={isSelf || toggleActive.isPending}
                        onCheckedChange={(checked) =>
                          toggleActive.mutate(
                            { userId: account.id, isActive: checked },
                            {
                              onSuccess: () =>
                                toast.success(checked ? "Usuario activado" : "Usuario desactivado"),
                              onError: (error: Error) =>
                                toast.error(error.message || "No se pudo actualizar el estado"),
                            },
                          )
                        }
                      />
                      <span className="text-sm text-muted-foreground">
                        {account.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {canEditData && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg"
                          onClick={() => setEditing(account)}
                          aria-label="Editar usuario"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {canEditRole && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg text-destructive"
                          onClick={() => setDeleting(account)}
                          aria-label="Eliminar usuario"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditUserDialog
        user={editing}
        canEditRole={editing ? editing.id !== user?.id : false}
        onClose={() => setEditing(null)}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar a "{deleting?.full_name || deleting?.email}"? Esta acción no se puede
              deshacer. Si ya registró ventas o turnos de caja, no se podrá eliminar — desactívelo
              en su lugar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
