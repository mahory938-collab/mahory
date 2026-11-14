import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentMethodSettings, StoreSettings } from "@/features/settings/use-settings";
import {
  usePaymentMethodSettings,
  useReceiptSettings,
  useSavePaymentMethodSettings,
  useSaveReceiptSettings,
  useSaveStoreSettings,
  useStoreSettings,
} from "@/features/settings/use-settings";
import { downloadJson } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración — Mahory" },
      { name: "description", content: "Configure la tienda, impuestos e impresoras." },
      { property: "og:title", content: "Configuración — Mahory" },
      { property: "og:description", content: "Configure la tienda, impuestos e impresoras." },
    ],
  }),
  component: ConfiguracionPage,
});

const storeSchema = z.object({
  name: z.string().trim().min(2, "Ingrese un nombre"),
  legal_name: z.string().trim().max(200),
  tax_id: z.string().trim().max(40),
  phone: z.string().trim().max(30),
  email: z.string().trim().max(255).refine((v) => v === "" || z.string().email().safeParse(v).success, {
    message: "Correo inválido",
  }),
  address: z.string().trim().max(255),
  city: z.string().trim().max(120),
  currency: z.string().trim().min(1, "Requerido").max(10),
  default_tax_rate: z.coerce.number().min(0).max(100),
  receipt_footer: z.string().trim().max(300),
});

type StoreFormValues = z.infer<typeof storeSchema>;

function toFormValues(store: StoreSettings): StoreFormValues {
  return {
    name: store.name,
    legal_name: store.legal_name ?? "",
    tax_id: store.tax_id ?? "",
    phone: store.phone ?? "",
    email: store.email ?? "",
    address: store.address ?? "",
    city: store.city ?? "",
    currency: store.currency,
    default_tax_rate: store.default_tax_rate,
    receipt_footer: store.receipt_footer ?? "",
  };
}

function ConfiguracionPage() {
  const { data: store, isLoading: storeLoading } = useStoreSettings();
  const saveStore = useSaveStoreSettings();

  const { data: paymentMethods } = usePaymentMethodSettings();
  const savePaymentMethods = useSavePaymentMethodSettings();

  const { data: receiptSettings } = useReceiptSettings();
  const saveReceiptSettings = useSaveReceiptSettings();

  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: "",
      legal_name: "",
      tax_id: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      currency: "COP",
      default_tax_rate: 19,
      receipt_footer: "",
    },
  });

  useEffect(() => {
    if (store) form.reset(toFormValues(store));
  }, [store, form]);

  const submitStore = (values: StoreFormValues) => {
    saveStore.mutate(values, {
      onSuccess: () => toast.success("Datos de la tienda actualizados"),
      onError: (error: Error) => toast.error(error.message || "No se pudo guardar"),
    });
  };

  const togglePaymentMethod = (key: keyof PaymentMethodSettings, checked: boolean) => {
    if (!paymentMethods) return;
    savePaymentMethods.mutate(
      { ...paymentMethods, [key]: checked },
      {
        onError: (error: Error) => toast.error(error.message || "No se pudo guardar"),
      },
    );
  };

  const exportBackup = async () => {
    try {
      const [products, categories, brands, customers, suppliers] = await Promise.all([
        supabase.from("products").select("*"),
        supabase.from("categories").select("*"),
        supabase.from("brands").select("*"),
        supabase.from("customers").select("*"),
        supabase.from("suppliers").select("*"),
      ]);
      for (const res of [products, categories, brands, customers, suppliers]) {
        if (res.error) throw res.error;
      }
      downloadJson(`respaldo-${new Date().toISOString().slice(0, 10)}.json`, {
        exported_at: new Date().toISOString(),
        products: products.data,
        categories: categories.data,
        brands: brands.data,
        customers: customers.data,
        suppliers: suppliers.data,
      });
      toast.success("Respaldo descargado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar el respaldo");
    }
  };

  return (
    <AppShell title="Configuración" description="Ajustes del sistema">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Datos de la tienda</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {storeLoading ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : (
              <form onSubmit={form.handleSubmit(submitStore)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nombre comercial" error={form.formState.errors.name?.message} full>
                    <Input className="h-10 rounded-xl" {...form.register("name")} />
                  </Field>
                  <Field label="Razón social">
                    <Input className="h-10 rounded-xl" {...form.register("legal_name")} />
                  </Field>
                  <Field label="NIT">
                    <Input className="h-10 rounded-xl" {...form.register("tax_id")} />
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
                  <Field label="Moneda" error={form.formState.errors.currency?.message}>
                    <Input className="h-10 rounded-xl" {...form.register("currency")} />
                  </Field>
                  <Field
                    label="IVA por defecto (%)"
                    error={form.formState.errors.default_tax_rate?.message}
                  >
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      className="h-10 rounded-xl"
                      {...form.register("default_tax_rate")}
                    />
                  </Field>
                  <Field label="Dirección" full>
                    <Input className="h-10 rounded-xl" {...form.register("address")} />
                  </Field>
                  <Field label="Pie de recibo" full>
                    <Textarea rows={2} className="rounded-xl" {...form.register("receipt_footer")} />
                  </Field>
                </div>

                <Button type="submit" className="rounded-xl" disabled={saveStore.isPending}>
                  {saveStore.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Guardar cambios
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Métodos de pago habilitados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {(
                [
                  { key: "efectivo", label: "Efectivo" },
                  { key: "tarjeta", label: "Tarjeta" },
                  { key: "transferencia", label: "Transferencia" },
                  { key: "credito", label: "Crédito" },
                ] as const
              ).map((option) => (
                <div key={option.key} className="flex items-center justify-between">
                  <Label className="text-sm font-normal">{option.label}</Label>
                  <Switch
                    checked={paymentMethods?.[option.key] ?? true}
                    onCheckedChange={(checked) => togglePaymentMethod(option.key, checked)}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Los métodos desactivados dejan de aparecer al cobrar en el POS.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recibo e impresión</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <Label className="text-sm font-normal">Ancho de papel térmico</Label>
              <div className="grid grid-cols-2 gap-2">
                {[58, 80].map((mm) => (
                  <Button
                    key={mm}
                    type="button"
                    variant={receiptSettings?.widthMm === mm ? "default" : "outline"}
                    className="h-10 rounded-xl"
                    onClick={() =>
                      saveReceiptSettings.mutate(
                        { widthMm: mm as 58 | 80 },
                        {
                          onError: (error: Error) =>
                            toast.error(error.message || "No se pudo guardar"),
                        },
                      )
                    }
                  >
                    {mm}mm
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Ajusta el ancho del recibo impreso desde Ventas y el POS.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Copia de seguridad</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <p className="text-sm text-muted-foreground">
                Descargue un respaldo en JSON de productos, categorías, marcas, clientes y
                proveedores.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 rounded-xl"
                onClick={exportBackup}
              >
                <Download className="size-4" />
                Descargar respaldo
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
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
    <div className={full ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
