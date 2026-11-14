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
import { CategoryFormDialog } from "@/features/products/category-form-dialog";
import type { Category } from "@/features/products/use-categories-admin";
import { useCategoriesAdmin, useDeleteCategory } from "@/features/products/use-categories-admin";
import { useAuth } from "@/hooks/use-auth";
import { roleHasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/categorias")({
  head: () => ({
    meta: [
      { title: "Categorías — Mahory" },
      { name: "description", content: "Administre las categorías del catálogo." },
      { property: "og:title", content: "Categorías — Mahory" },
      { property: "og:description", content: "Administre las categorías del catálogo." },
    ],
  }),
  component: CategoriasPage,
});

function CategoriasPage() {
  const { role } = useAuth();
  const canManage = roleHasPermission(role, "categories.manage");

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const { data: categories, isLoading } = useCategoriesAdmin(search);
  const deleteCategory = useDeleteCategory();

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteCategory.mutateAsync(deleting.id);
      toast.success("Categoría eliminada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la categoría");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AppShell
      title="Categorías"
      description="Categorías del catálogo de productos"
      actions={
        canManage && (
          <Button className="h-9 gap-2 rounded-lg" onClick={openCreate}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Nueva categoría</span>
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
            placeholder="Buscar por nombre"
            className="h-10 rounded-xl pl-9"
          />
        </div>

        <Card className="overflow-hidden rounded-2xl shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoría</TableHead>
                <TableHead>Estado</TableHead>
                {canManage && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={canManage ? 3 : 2}>
                      <Skeleton className="h-10 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading && categories?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 3 : 2} className="py-16 text-center text-sm text-muted-foreground">
                    No se encontraron categorías.
                  </TableCell>
                </TableRow>
              )}

              {categories?.map((category) => (
                <TableRow
                  key={category.id}
                  className={canManage ? "cursor-pointer" : undefined}
                  onClick={() => canManage && openEdit(category)}
                >
                  <TableCell>
                    <p className="font-medium">{category.name}</p>
                    {category.description && (
                      <p className="text-xs text-muted-foreground">{category.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={category.is_active ? "secondary" : "outline"}
                      className="rounded-full"
                    >
                      {category.is_active ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg"
                          onClick={() => openEdit(category)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg text-destructive"
                          onClick={() => setDeleting(category)}
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
        <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={editing} />
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar categoría</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar "{deleting?.name}"? Los productos que la usan quedarán sin categoría. Esta
              acción no se puede deshacer.
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
