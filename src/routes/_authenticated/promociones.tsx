import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PromotionFormDialog } from "@/features/promotions/promotion-form-dialog";
import type { Promotion } from "@/features/promotions/use-promotions";
import {
  isPromotionCurrentlyActive,
  useDeletePromotion,
  usePromotions,
} from "@/features/promotions/use-promotions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/promociones")({
  head: () => ({
    meta: [
      { title: "Promociones — Body Positive POS" },
      { name: "description", content: "Cree descuentos por producto, categoría o generales con vigencia." },
      { property: "og:title", content: "Promociones — Body Positive POS" },
      {
        property: "og:description",
        content: "Cree descuentos por producto, categoría o generales con vigencia.",
      },
    ],
  }),
  component: PromocionesPage,
});

const SCOPE_LABELS: Record<Promotion["scope"], string> = {
  all: "Todos los productos",
  category: "Categoría",
  product: "Producto",
};

function PromocionesPage() {
  const { data: promotions, isLoading } = usePromotions();
  const deletePromotion = useDeletePromotion();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [deleting, setDeleting] = useState<Promotion | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (promotion: Promotion) => {
    setEditing(promotion);
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deletePromotion.mutateAsync(deleting.id);
      toast.success("Promoción eliminada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AppShell
      title="Promociones"
      description="Descuentos automáticos por producto, categoría o generales"
      actions={
        <Button className="h-9 gap-2 rounded-lg" onClick={openCreate}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Nueva promoción</span>
        </Button>
      }
    >
      <Card className="overflow-hidden rounded-2xl shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Promoción</TableHead>
              <TableHead>Aplica a</TableHead>
              <TableHead className="text-right">Descuento</TableHead>
              <TableHead>Vigencia</TableHead>
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

            {!isLoading && promotions?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                  No hay promociones creadas. Cree la primera con "Nueva promoción".
                </TableCell>
              </TableRow>
            )}

            {promotions?.map((promotion) => {
              const isLive = isPromotionCurrentlyActive(promotion);
              return (
                <TableRow key={promotion.id} className="cursor-pointer" onClick={() => openEdit(promotion)}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <Tag className="size-3.5 text-primary" />
                      {promotion.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {SCOPE_LABELS[promotion.scope]}
                    {promotion.scope !== "all" && promotion.targetName ? ` · ${promotion.targetName}` : ""}
                  </TableCell>
                  <TableCell className="text-right font-medium text-primary">
                    -{promotion.percent}%
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {promotion.startsAt || promotion.endsAt
                      ? `${promotion.startsAt ? formatDate(promotion.startsAt) : "—"} a ${
                          promotion.endsAt ? formatDate(promotion.endsAt) : "—"
                        }`
                      : "Sin límite"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={isLive ? "secondary" : "outline"}
                      className="rounded-full"
                    >
                      {!promotion.active ? "Inactiva" : isLive ? "Vigente" : "Fuera de vigencia"}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg"
                        onClick={() => openEdit(promotion)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg text-destructive"
                        onClick={() => setDeleting(promotion)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <PromotionFormDialog open={formOpen} onOpenChange={setFormOpen} promotion={editing} />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar promoción</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar "{deleting?.name}"? Esta acción no se puede deshacer.
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
