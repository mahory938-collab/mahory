import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { uploadProductImage } from "@/features/products/upload-product-image";
import type { AdminProduct, ProductFormValues } from "@/features/products/use-products-admin";
import {
  useBrands,
  useCategories,
  useSaveProduct,
  useSuppliers,
} from "@/features/products/use-products-admin";
import { cn } from "@/lib/utils";

const productSchema = z.object({
  name: z.string().trim().min(2, "Ingrese un nombre"),
  barcode: z.string().trim().max(64, "Máximo 64 caracteres"),
  sku: z.string().trim().max(64, "Máximo 64 caracteres"),
  description: z.string().trim().max(1000, "Máximo 1000 caracteres"),
  category_id: z.string().nullable(),
  brand_id: z.string().nullable(),
  supplier_id: z.string().nullable(),
  cost: z.coerce.number().min(0, "Debe ser 0 o mayor"),
  price: z.coerce.number().min(0, "Debe ser 0 o mayor"),
  wholesale_price: z.coerce.number().min(0, "Debe ser 0 o mayor"),
  stock: z.coerce.number().min(0, "Debe ser 0 o mayor"),
  min_stock: z.coerce.number().min(0, "Debe ser 0 o mayor"),
  image_url: z.string().nullable(),
  status: z.enum(["active", "inactive"]),
});

const EMPTY_VALUES: ProductFormValues = {
  name: "",
  barcode: "",
  sku: "",
  description: "",
  category_id: null,
  brand_id: null,
  supplier_id: null,
  cost: 0,
  price: 0,
  wholesale_price: 0,
  stock: 0,
  min_stock: 0,
  image_url: null,
  status: "active",
};

const NONE = "__none__";

type ProductFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: AdminProduct | null;
  /** Pre-fills a new product's fields (e.g. from the barcode quick-add flow). Ignored when editing. */
  initialValues?: Partial<ProductFormValues> | null;
};

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  initialValues,
}: ProductFormDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const { data: categories } = useCategories();
  const { data: brands } = useBrands();
  const { data: suppliers } = useSuppliers();
  const save = useSaveProduct(product?.id ?? null);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    setLocalPreview(null);
    form.reset(
      product
        ? {
            name: product.name,
            barcode: product.barcode ?? "",
            sku: product.sku ?? "",
            description: product.description ?? "",
            category_id: product.category_id,
            brand_id: product.brand_id,
            supplier_id: product.supplier_id,
            cost: product.cost,
            price: product.price,
            wholesale_price: product.wholesale_price,
            stock: product.stock,
            min_stock: product.min_stock,
            image_url: product.image_url,
            status: product.status,
          }
        : { ...EMPTY_VALUES, ...initialValues },
    );
  }, [open, product, initialValues, form]);

  const imageUrl = form.watch("image_url");

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadProductImage({ data: formData });
    },
    onSuccess: (result) => {
      form.setValue("image_url", result.url, { shouldDirty: true });
    },
    onError: (error: Error) => {
      toast.error(error.message || "No se pudo subir la imagen");
      setLocalPreview(null);
    },
  });

  const handlePickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLocalPreview(URL.createObjectURL(file));
    upload.mutate(file);
  };

  const submit = useMutation({
    mutationFn: (values: ProductFormValues) => save.mutateAsync(values),
    onSuccess: () => {
      toast.success(product ? "Producto actualizado" : "Producto creado");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "No se pudo guardar el producto");
    },
  });

  const preview = localPreview ?? imageUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Editar producto" : "Nuevo producto"}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => submit.mutate(values))}
          className="space-y-5"
        >
          <div className="flex items-start gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handlePickImage}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed bg-surface text-muted-foreground transition-colors hover:border-primary/50",
                preview && "border-solid",
              )}
            >
              {preview ? (
                <img src={preview} alt="Producto" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-6" />
              )}
              {upload.isPending && (
                <div className="absolute inset-0 grid place-items-center bg-background/70">
                  <Loader2 className="size-5 animate-spin text-primary" />
                </div>
              )}
            </button>
            <div className="flex-1 space-y-1.5 pt-1">
              <p className="text-sm font-medium">Imagen del producto</p>
              <p className="text-xs text-muted-foreground">PNG, JPG, WEBP o GIF · máx. 20MB</p>
              {preview && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 rounded-lg px-2 text-xs text-destructive"
                  onClick={() => {
                    setLocalPreview(null);
                    form.setValue("image_url", null, { shouldDirty: true });
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Quitar imagen
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" error={form.formState.errors.name?.message} full>
              <Input className="h-10 rounded-xl" {...form.register("name")} />
            </Field>

            <Field label="Código de barras" error={form.formState.errors.barcode?.message}>
              <Input className="h-10 rounded-xl" {...form.register("barcode")} />
            </Field>

            <Field label="SKU" error={form.formState.errors.sku?.message}>
              <Input className="h-10 rounded-xl" {...form.register("sku")} />
            </Field>

            <Field label="Categoría">
              <Select
                value={form.watch("category_id") ?? NONE}
                onValueChange={(v) => form.setValue("category_id", v === NONE ? null : v)}
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin categoría</SelectItem>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Marca">
              <Select
                value={form.watch("brand_id") ?? NONE}
                onValueChange={(v) => form.setValue("brand_id", v === NONE ? null : v)}
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin marca</SelectItem>
                  {brands?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Proveedor">
              <Select
                value={form.watch("supplier_id") ?? NONE}
                onValueChange={(v) => form.setValue("supplier_id", v === NONE ? null : v)}
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin proveedor</SelectItem>
                  {suppliers?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Estado">
              <div className="flex h-10 items-center gap-2">
                <Switch
                  checked={form.watch("status") === "active"}
                  onCheckedChange={(checked) =>
                    form.setValue("status", checked ? "active" : "inactive")
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {form.watch("status") === "active" ? "Activo" : "Inactivo"}
                </span>
              </div>
            </Field>

            <Field label="Costo" error={form.formState.errors.cost?.message}>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-10 rounded-xl"
                {...form.register("cost")}
              />
            </Field>

            <Field label="Precio venta" error={form.formState.errors.price?.message}>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-10 rounded-xl"
                {...form.register("price")}
              />
            </Field>

            <Field
              label="Precio mayorista"
              error={form.formState.errors.wholesale_price?.message}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-10 rounded-xl"
                {...form.register("wholesale_price")}
              />
            </Field>

            <Field label="Stock" error={form.formState.errors.stock?.message}>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-10 rounded-xl"
                {...form.register("stock")}
              />
            </Field>

            <Field label="Stock mínimo" error={form.formState.errors.min_stock?.message}>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-10 rounded-xl"
                {...form.register("min_stock")}
              />
            </Field>

            <Field label="Descripción" error={form.formState.errors.description?.message} full>
              <Textarea rows={3} className="rounded-xl" {...form.register("description")} />
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
            <Button
              type="submit"
              className="rounded-xl"
              disabled={submit.isPending || upload.isPending}
            >
              {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {product ? "Guardar cambios" : "Crear producto"}
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
