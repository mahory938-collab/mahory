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
import type { Category, CategoryFormValues } from "@/features/products/use-categories-admin";
import { useSaveCategory } from "@/features/products/use-categories-admin";

const categorySchema = z.object({
  name: z.string().trim().min(2, "Ingrese un nombre"),
  description: z.string().trim().max(500),
  is_active: z.boolean(),
});

const EMPTY_VALUES: CategoryFormValues = {
  name: "",
  description: "",
  is_active: true,
};

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
}) {
  const save = useSaveCategory(category?.id ?? null);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      category
        ? {
            name: category.name,
            description: category.description ?? "",
            is_active: category.is_active,
          }
        : EMPTY_VALUES,
    );
  }, [open, category, form]);

  const submit = useMutation({
    mutationFn: (values: CategoryFormValues) => save.mutateAsync(values),
    onSuccess: () => {
      toast.success(category ? "Categoría actualizada" : "Categoría creada");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "No se pudo guardar la categoría"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((values) => submit.mutate(values))} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input className="h-10 rounded-xl" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Descripción (opcional)</Label>
            <Textarea rows={2} className="rounded-xl" {...form.register("description")} />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Categoría activa</Label>
            <Switch
              checked={form.watch("is_active")}
              onCheckedChange={(checked) => form.setValue("is_active", checked)}
            />
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
              {category ? "Guardar cambios" : "Crear categoría"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
