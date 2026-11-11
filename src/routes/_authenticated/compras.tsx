import { createFileRoute } from "@tanstack/react-router";
import { Loader2, PackageCheck, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCashSession } from "@/features/cash/use-cash";
import { PurchaseFormDialog } from "@/features/purchases/purchase-form-dialog";
import type { PurchasePaymentMethod, PurchaseStatus } from "@/features/purchases/use-purchases";
import {
  usePurchaseDetail,
  usePurchasesList,
  useReceivePurchase,
} from "@/features/purchases/use-purchases";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { roleHasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/compras")({
  head: () => ({
    meta: [
      { title: "Compras — Body Positive POS" },
      { name: "description", content: "Registre compras y reciba inventario." },
      { property: "og:title", content: "Compras — Body Positive POS" },
      { property: "og:description", content: "Registre compras y reciba inventario." },
    ],
  }),
  component: ComprasPage,
});

const STATUS_LABELS: Record<PurchaseStatus, string> = {
  borrador: "Borrador",
  recibida: "Recibida",
  anulada: "Anulada",
};

function statusVariant(status: PurchaseStatus): "secondary" | "outline" | "destructive" {
  if (status === "recibida") return "secondary";
  if (status === "anulada") return "destructive";
  return "outline";
}

function ComprasPage() {
  const { role } = useAuth();
  const canManage = roleHasPermission(role, "purchases.manage");

  const [status, setStatus] = useState<PurchaseStatus | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: purchases, isLoading } = usePurchasesList({ status, search: "" });

  return (
    <AppShell
      title="Compras"
      description="Órdenes de compra"
      actions={
        canManage && (
          <Button className="h-9 gap-2 rounded-lg" onClick={() => setFormOpen(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Nueva compra</span>
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <Select value={status} onValueChange={(v) => setStatus(v as PurchaseStatus | "all")}>
          <SelectTrigger className="h-10 w-48 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="borrador">Borrador</SelectItem>
            <SelectItem value="recibida">Recibida</SelectItem>
            <SelectItem value="anulada">Anulada</SelectItem>
          </SelectContent>
        </Select>

        <Card className="overflow-hidden rounded-2xl shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Compra</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-10 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading && purchases?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-16 text-center text-sm text-muted-foreground">
                    No hay compras registradas.
                    {canManage && " Cree la primera con “Nueva compra”."}
                  </TableCell>
                </TableRow>
              )}

              {purchases?.map((purchase) => (
                <TableRow
                  key={purchase.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(purchase.id)}
                >
                  <TableCell className="font-medium">#{purchase.number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(purchase.created_at)}
                  </TableCell>
                  <TableCell className="text-sm">{purchase.supplier_name || "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(purchase.total)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(purchase.status)} className="rounded-full">
                      {STATUS_LABELS[purchase.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {canManage && <PurchaseFormDialog open={formOpen} onOpenChange={setFormOpen} />}

      <PurchaseDetailDialog
        purchaseId={selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
        canManage={canManage}
      />
    </AppShell>
  );
}

function PurchaseDetailDialog({
  purchaseId,
  onOpenChange,
  canManage,
}: {
  purchaseId: string | null;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}) {
  const { data: purchase, isLoading } = usePurchaseDetail(purchaseId);
  const { data: activeCashSession } = useActiveCashSession();
  const receivePurchase = useReceivePurchase();
  const [paymentPromptOpen, setPaymentPromptOpen] = useState(false);

  const confirmReceive = (paymentMethod: PurchasePaymentMethod) => {
    if (!purchase) return;
    setPaymentPromptOpen(false);
    receivePurchase.mutate(
      {
        purchaseId: purchase.id,
        total: purchase.total,
        number: purchase.number,
        paymentMethod,
        cashSessionId: activeCashSession?.id ?? null,
      },
      {
        onSuccess: () => toast.success("Inventario recibido y actualizado"),
        onError: (error: Error) => toast.error(error.message || "No se pudo recibir la compra"),
      },
    );
  };

  return (
    <Dialog open={Boolean(purchaseId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{purchase ? `Compra #${purchase.number}` : "Detalle de compra"}</DialogTitle>
        </DialogHeader>

        {isLoading || !purchase ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{formatDateTime(purchase.created_at)}</span>
              <Badge variant={statusVariant(purchase.status)} className="rounded-full">
                {STATUS_LABELS[purchase.status]}
              </Badge>
            </div>
            {purchase.supplier_name && <p className="text-sm">Proveedor: {purchase.supplier_name}</p>}
            {purchase.notes && <p className="text-sm text-muted-foreground">{purchase.notes}</p>}

            <div className="divide-y rounded-xl border">
              {purchase.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} x {formatCurrency(item.unit_cost)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{formatCurrency(item.total)}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-xl bg-surface p-3 text-sm font-semibold">
              <span>Total</span>
              <span>{formatCurrency(purchase.total)}</span>
            </div>

            {canManage && purchase.status === "borrador" && !paymentPromptOpen && (
              <Button
                className="w-full gap-2 rounded-xl"
                onClick={() => setPaymentPromptOpen(true)}
              >
                <PackageCheck className="size-4" />
                Recibir mercancía
              </Button>
            )}

            {canManage && purchase.status === "borrador" && paymentPromptOpen && (
              <div className="space-y-2 rounded-xl border p-3">
                <p className="text-sm font-medium">¿Cómo pagó esta compra?</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl"
                    disabled={receivePurchase.isPending}
                    onClick={() => confirmReceive("efectivo")}
                  >
                    Efectivo
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl"
                    disabled={receivePurchase.isPending}
                    onClick={() => confirmReceive("transferencia")}
                  >
                    Transferencia
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl"
                    disabled={receivePurchase.isPending}
                    onClick={() => confirmReceive("credito")}
                  >
                    Crédito proveedor
                  </Button>
                </div>
                {receivePurchase.isPending ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Recibiendo...
                  </p>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-lg text-xs"
                    onClick={() => setPaymentPromptOpen(false)}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            )}

            {purchase.status === "recibida" && purchase.received_at && (
              <p className="text-center text-xs text-muted-foreground">
                Recibida el {formatDateTime(purchase.received_at)}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
