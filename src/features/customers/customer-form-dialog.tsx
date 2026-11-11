import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Customer, CustomerFormValues } from "@/features/customers/use-customers";
import { useSaveCustomer } from "@/features/customers/use-customers";
import { cn } from "@/lib/utils";

const customerSchema = z.object({
  name: z.string().trim().min(2, "Ingrese un nombre"),
  document_type: z.string().trim().max(20),
  document_number: z.string().trim().max(40),
  phone: z.string().trim().max(30),
  email: z.string().trim().max(255).refine((v) => v === "" || z.string().email().safeParse(v).success, {
    message: "Correo inválido",
  }),
  address: z.string().trim().max(255),
  city: z.string().trim().max(120),
  notes: z.string().trim().max(1000),
  credit_limit: z.coerce.number().min(0, "Debe ser 0 o mayor"),
  is_active: z.boolean(),
});

const EMPTY_VALUES: CustomerFormValues = {
  name: "",
  document_type: "CC",
  document_number: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  notes: "",
  credit_limit: 0,
  is_active: true,
};

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}) {
  const save = useSaveCustomer(customer?.id ?? null);
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      customer
        ? {
            name: customer.name,
            document_type: customer.document_type ?? "CC",
            document_number: customer.document_number ?? "",
            phone: customer.phone ?? "",
            email: customer.email ?? "",
            address: customer.address ?? "",
            city: customer.city ?? "",
            notes: customer.notes ?? "",
            credit_limit: customer.credit_limit,
            is_active: customer.is_active,
          }
        : EMPTY_VALUES,
    );
  }, [open, customer, form]);

  const submit = useMutation({
    mutationFn: (values: CustomerFormValues) => save.mutateAsync(values),
    onSuccess: () => {
      toast.success(customer ? "Cliente actualizado" : "Cliente creado");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "No se pudo guardar el cliente"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((values) => submit.mutate(values))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" error={form.formState.errors.name?.message} full>
              <Input className="h-10 rounded-xl" {...form.register("name")} />
            </Field>

            <Field label="Tipo de documento">
              <Input className="h-10 rounded-xl" {...form.register("document_type")} />
            </Field>

            <Field label="Número de documento" error={form.formState.errors.document_number?.message}>
              <Input className="h-10 rounded-xl" {...form.register("document_number")} />
            </Field>

            <Field label="Teléfono">
              <Input className="h-10 rounded-xl" {...form.register("phone")} />
            </Field>

            <Field label="Correo" error={form.formState.errors.email?.message}>
              <Input type="email" className="h-10 rounded-xl" {...form.register("email")} />
            </Field>

            <Field label="Ciudad">
              <Input className="h-10 rounded-xl" {...form.register("city")} />
            </Field>

            <Field label="Cupo de crédito" error={form.formState.errors.credit_limit?.message}>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-10 rounded-xl"
                {...form.register("credit_limit")}
              />
            </Field>

            <Field label="Estado">
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
              {customer ? "Guardar cambios" : "Crear cliente"}
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
