import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Supplier, SupplierFormValues } from "@/features/suppliers/use-suppliers";
import { useSaveSupplier, useSupplierPurchases } from "@/features/suppliers/use-suppliers";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const supplierSchema = z.object({
  name: z.string().trim().min(2, "Ingrese un nombre"),
  tax_id: z.string().trim().max(40),
  contact_name: z.string().trim().max(120),
  phone: z.string().trim().max(30),
  email: z.string().trim().max(255).refine((v) => v === "" || z.string().email().safeParse(v).success, {
    message: "Correo inválido",
  }),
  address: z.string().trim().max(255),
  notes: z.string().trim().max(1000),
  is_active: z.boolean(),
});

const EMPTY_VALUES: SupplierFormValues = {
  name: "",
  tax_id: "",
  contact_name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  is_active: true,
};

const STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  recibida: "Recibida",
  anulada: "Anulada",
};

export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}) {
  const save = useSaveSupplier(supplier?.id ?? null);
  const { data: purchases, isLoading: purchasesLoading } = useSupplierPurchases(
    supplier?.id ?? null,
  );

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      supplier
        ? {
            name: supplier.name,
            tax_id: supplier.tax_id ?? "",
            contact_name: supplier.contact_name ?? "",
            phone: supplier.phone ?? "",
            email: supplier.email ?? "",
            address: supplier.address ?? "",
            notes: supplier.notes ?? "",
            is_active: supplier.is_active,
          }
        : EMPTY_VALUES,
    );
  }, [open, supplier, form]);

  const submit = useMutation({
    mutationFn: (values: SupplierFormValues) => save.mutateAsync(values),
    onSuccess: () => {
      toast.success(supplier ? "Proveedor actualizado" : "Proveedor creado");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "No se pudo guardar el proveedor"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((values) => submit.mutate(values))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" error={form.formState.errors.name?.message} full>
              <Input className="h-10 rounded-xl" {...form.register("name")} />
            </Field>

            <Field label="NIT / Documento">
              <Input className="h-10 rounded-xl" {...form.register("tax_id")} />
            </Field>

            <Field label="Contacto">
              <Input className="h-10 rounded-xl" {...form.register("contact_name")} />
            </Field>

            <Field label="Teléfono">
              <Input className="h-10 rounded-xl" {...form.register("phone")} />
            </Field>

            <Field label="Correo" error={form.formState.errors.email?.message}>
              <Input type="email" className="h-10 rounded-xl" {...form.register("email")} />
            </Field>

            <Field label="Estado" full>
              <div className="flex h-10 items-center gap-2">
                <Switch
                  checked={form.watch("is_active")}
                  onCheckedChange={(checked) => form.setValue("is_active", checked)}
                />
                <span className="text-sm text-muted-foreground">
                  {form.watch("is_active") ? "Activo" : "Inactivo"}
                </span>
              </div>
            </Field>

            <Field label="Dirección" full>
              <Input className="h-10 rounded-xl" {...form.register("address")} />
            </Field>

            <Field label="Notas" full>
              <Textarea rows={2} className="rounded-xl" {...form.register("notes")} />
            </Field>
          </div>

          {supplier && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Historial de compras</Label>
              {purchasesLoading ? (
                <Skeleton className="h-16 rounded-xl" />
              ) : (purchases?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Sin compras registradas.</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border p-1.5">
                  {purchases?.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <span>
                        #{purchase.number} · {formatDateTime(purchase.created_at)}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="rounded-full text-xs">
                          {STATUS_LABELS[purchase.status] ?? purchase.status}
                        </Badge>
                        <span className="font-medium">{formatCurrency(purchase.total)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="rounded-xl" disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {supplier ? "Guardar cambios" : "Crear proveedor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  full,
  children,
}: {
  label: string;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", full && "sm:col-span-2")}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
