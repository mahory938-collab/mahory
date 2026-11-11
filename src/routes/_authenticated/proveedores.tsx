import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SupplierFormDialog } from "@/features/suppliers/supplier-form-dialog";
import type { Supplier } from "@/features/suppliers/use-suppliers";
import { useDeleteSupplier, useSuppliersAdmin } from "@/features/suppliers/use-suppliers";
import { useAuth } from "@/hooks/use-auth";
import { roleHasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/proveedores")({
  head: () => ({
    meta: [
      { title: "Proveedores — Body Positive POS" },
      { name: "description", content: "Administre proveedores y su historial." },
      { property: "og:title", content: "Proveedores — Body Positive POS" },
      { property: "og:description", content: "Administre proveedores y su historial." },
    ],
  }),
  component: ProveedoresPage,
});

function ProveedoresPage() {
  const { role } = useAuth();
  const canManage = roleHasPermission(role, "suppliers.manage");

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);

  const { data: suppliers, isLoading } = useSuppliersAdmin(search);
  const deleteSupplier = useDeleteSupplier();

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditing(supplier);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteSupplier.mutateAsync(deleting.id);
      toast.success("Proveedor eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el proveedor");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AppShell
      title="Proveedores"
      description="Directorio de proveedores"
      actions={
        canManage && (
          <Button className="h-9 gap-2 rounded-lg" onClick={openCreate}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Nuevo proveedor</span>
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, NIT o contacto"
            className="h-10 rounded-xl pl-9"
          />
        </div>

        <Card className="overflow-hidden rounded-2xl shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
                {canManage && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={canManage ? 5 : 4}>
                      <Skeleton className="h-10 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading && suppliers?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 5 : 4} className="py-16 text-center text-sm text-muted-foreground">
                    No se encontraron proveedores.
                  </TableCell>
                </TableRow>
              )}

              {suppliers?.map((supplier) => (
                <TableRow
                  key={supplier.id}
                  className={canManage ? "cursor-pointer" : undefined}
                  onClick={() => canManage && openEdit(supplier)}
                >
                  <TableCell>
                    <p className="font-medium">{supplier.name}</p>
                    <p className="text-xs text-muted-foreground">{supplier.tax_id || "—"}</p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {supplier.contact_name || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {supplier.phone || supplier.email || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={supplier.is_active ? "secondary" : "outline"}
                      className="rounded-full"
                    >
                      {supplier.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg"
                          onClick={() => openEdit(supplier)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg text-destructive"
                          onClick={() => setDeleting(supplier)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {canManage && (
        <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editing} />
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar proveedor</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar “{deleting?.name}”? Esta acción no se puede deshacer.
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
