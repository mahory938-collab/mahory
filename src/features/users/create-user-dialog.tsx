import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { useCreateUser } from "@/features/users/use-users";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";

const createUserSchema = z.object({
  fullName: z.string().trim().min(3, "Ingrese el nombre completo"),
  email: z.string().trim().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  role: z.enum(["super_admin", "admin", "vendedor"]),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

export function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createUser = useCreateUser();
  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { fullName: "", email: "", password: "", role: "vendedor" },
  });

  const submit = useMutation({
    mutationFn: (values: CreateUserValues) =>
      createUser.mutateAsync({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        role: values.role as AppRole,
      }),
    onSuccess: () => {
      toast.success("Usuario creado");
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "No se pudo crear el usuario"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) form.reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((values) => submit.mutate(values))} className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre completo</Label>
            <Input className="h-10 rounded-xl" {...form.register("fullName")} />
            {form.formState.errors.fullName && (
              <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Correo electrónico</Label>
            <Input type="email" className="h-10 rounded-xl" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Contraseña</Label>
            <Input type="password" className="h-10 rounded-xl" {...form.register("password")} />
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Rol</Label>
            <Select
              value={form.watch("role")}
              onValueChange={(value) => form.setValue("role", value as CreateUserValues["role"])}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vendedor">{ROLE_LABELS.vendedor}</SelectItem>
                <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                <SelectItem value="super_admin">{ROLE_LABELS.super_admin}</SelectItem>
              </SelectContent>
            </Select>
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
              Crear usuario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
