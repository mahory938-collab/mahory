import { createFileRoute, Link } from "@tanstack/react-router";
import { ImageOff, Layers, Pencil, Plus, Scan, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

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
import { AppShell } from "@/components/layout/app-shell";
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
import { BarcodeQuickAddDialog } from "@/features/products/barcode-quick-add-dialog";
import { ProductFamilyDialog } from "@/features/products/product-family-dialog";
import { ProductFormDialog } from "@/features/products/product-form-dialog";
import type { AdminProduct, ProductFormValues } from "@/features/products/use-products-admin";
import { useAdminProducts, useDeleteProduct } from "@/features/products/use-products-admin";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, formatNumber } from "@/lib/format";
import { roleHasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/productos")({
  head: () => ({
    meta: [
      { title: "Productos — Mahory" },
      { name: "description", content: "Cree productos, agregue imágenes y organice su catálogo." },
      { property: "og:title", content: "Productos — Mahory" },
      { property: "og:description", content: "Cree productos, agregue imágenes y organice su catálogo." },
    ],
  }),
  component: ProductosPage,
});

type ProductFamily = {
  key: string;
  name: string;
  products: AdminProduct[];
};

function ProductosPage() {
  const { role } = useAuth();
  const canManage = roleHasPermission(role, "products.manage");

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [editingFamily, setEditingFamily] = useState<ProductFamily | null>(null);
  const [deletingFamily, setDeletingFamily] = useState<ProductFamily | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [formInitialValues, setFormInitialValues] = useState<Partial<ProductFormValues> | null>(
    null,
  );

  const { data: products, isLoading } = useAdminProducts(search);
  const deleteProduct = useDeleteProduct();

  // Same product name, different barcode (sizes, colors) — one row per name.
  const families = useMemo(() => {
    const map = new Map<string, ProductFamily>();
    for (const product of products ?? []) {
      const key = product.name.trim().toLowerCase();
      const family = map.get(key);
      if (family) family.products.push(product);
      else map.set(key, { key, name: product.name, products: [product] });
    }
    return [...map.values()];
  }, [products]);

  const openCreate = () => {
    setFormInitialValues(null);
    setFormOpen(true);
  };

  const openEdit = (family: ProductFamily) => {
    setEditingFamily(family);
    setFamilyOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingFamily) return;
    try {
      await Promise.all(deletingFamily.products.map((p) => deleteProduct.mutateAsync(p.id)));
      toast.success("Producto eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el producto");
    } finally {
      setDeletingFamily(null);
    }
  };

  return (
    <AppShell
      title="Productos"
      description="Catálogo de productos"
      actions={
        canManage && (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="h-9 gap-2 rounded-lg">
              <Link to="/categorias">
                <Layers className="size-4" />
                <span className="hidden sm:inline">Categorías</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              className="h-9 gap-2 rounded-lg"
              onClick={() => setQuickAddOpen(true)}
            >
              <Scan className="size-4" />
              <span className="hidden sm:inline">Registrar por código</span>
            </Button>
            <Button className="h-9 gap-2 rounded-lg" onClick={openCreate}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Nuevo producto</span>
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, código o SKU"
            className="h-10 rounded-xl pl-9"
          />
        </div>

        <Card className="overflow-hidden rounded-2xl shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Imagen</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Estado</TableHead>
                {canManage && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={canManage ? 8 : 7}>
                      <Skeleton className="h-12 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading && families.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 8 : 7} className="py-16 text-center text-sm text-muted-foreground">
                    No se encontraron productos.
                    {canManage && " Cree el primero con el botón “Nuevo producto”."}
                  </TableCell>
                </TableRow>
              )}

              {families.map((family) => {
                const first = family.products[0];
                const totalStock = family.products.reduce((sum, p) => sum + p.stock, 0);
                const totalMinStock = family.products.reduce((sum, p) => sum + p.min_stock, 0);
                const prices = new Set(family.products.map((p) => p.price));
                const priceLabel =
                  prices.size === 1
                    ? formatCurrency(first.price)
                    : `Desde ${formatCurrency(Math.min(...prices))}`;

                return (
                  <TableRow
                    key={family.key}
                    className={canManage ? "cursor-pointer" : undefined}
                    onClick={() => canManage && openEdit(family)}
                  >
                    <TableCell>
                      <div className="grid size-11 place-items-center overflow-hidden rounded-lg bg-surface">
                        {first.image_url ? (
                          <img
                            src={first.image_url}
                            alt={first.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <ImageOff className="size-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{first.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {family.products.length === 1
                          ? first.sku || first.barcode || "—"
                          : `${family.products.length} códigos de barras`}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {first.category_name || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {first.supplier_name || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{priceLabel}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          totalStock <= totalMinStock ? "font-medium text-destructive" : undefined
                        }
                      >
                        {formatNumber(totalStock)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={first.status === "active" ? "secondary" : "outline"}
                        className="rounded-full"
                      >
                        {first.status === "active" ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg"
                            onClick={() => openEdit(family)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg text-destructive"
                            onClick={() => setDeletingFamily(family)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>

      {canManage && (
        <>
          <ProductFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            product={null}
            initialValues={formInitialValues}
          />
          {editingFamily && (
            <ProductFamilyDialog
              open={familyOpen}
              onOpenChange={setFamilyOpen}
              products={editingFamily.products}
            />
          )}
          <BarcodeQuickAddDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
        </>
      )}

      <AlertDialog
        open={Boolean(deletingFamily)}
        onOpenChange={(open) => !open && setDeletingFamily(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar "{deletingFamily?.name}"?{" "}
              {(deletingFamily?.products.length ?? 0) > 1
                ? `Esto borra sus ${deletingFamily?.products.length} códigos de barras.`
                : ""}{" "}
              Esta acción no se puede deshacer.
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
