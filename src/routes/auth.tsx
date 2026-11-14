import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { Loader2, LockKeyhole, Mail, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión — Mahory" },
      {
        name: "description",
        content:
          "Acceda al punto de venta: administre ventas, inventario, caja y reportes de su tienda.",
      },
      { property: "og:title", content: "Iniciar sesión — Mahory" },
      {
        property: "og:description",
        content: "Punto de venta profesional para tiendas de retail en Colombia.",
      },
    ],
  }),
  component: AuthPage,
});

const authSchema = z.object({
  email: z.string().trim().email({ message: "Correo inválido" }).max(255),
  password: z.string().min(6, { message: "Mínimo 6 caracteres" }).max(72),
  fullName: z.string().trim().max(120),
});

type AuthValues = z.infer<typeof authSchema>;

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const form = useForm<AuthValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: "", password: "", fullName: "" },
  });


  const submit = useMutation({
    mutationFn: async (values: AuthValues) => {
      if (mode === "signup" && values.fullName.trim().length < 3) {
        throw new Error("Ingrese su nombre completo");
      }
      if (mode === "signin") {

        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
        return { signedIn: true };
      }
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: values.fullName },
        },
      });
      if (error) throw error;
      return { signedIn: Boolean(data.session) };
    },
    onSuccess: (result) => {
      if (result.signedIn) {
        toast.success("Bienvenido");
        navigate({ to: "/dashboard", replace: true });
      } else {
        setEmailSent(true);
        toast.success("Cuenta creada. Revise su correo para confirmarla.");
      }
    },
    onError: (error: Error) => {
      const message = error.message.includes("Invalid login credentials")
        ? "Correo o contraseña incorrectos"
        : error.message.includes("already registered")
          ? "Este correo ya está registrado"
          : error.message;
      toast.error(message);
    },
  });

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-brand p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo-mahory.png" alt="Mahory" className="size-14 rounded-full shadow-glow" />
          <span className="font-serif text-xl font-semibold uppercase tracking-[0.3em] text-primary-foreground">
            Mahory
          </span>
        </div>

        <div className="max-w-md space-y-5">
          <h2 className="font-display text-4xl font-semibold leading-tight text-primary-foreground">
            Viste con amor, brilla con estilo.
          </h2>
          <p className="text-primary-foreground/80">
            Punto de venta, inventario, caja, compras y reportes en un solo sistema diseñado para
            tiendas de retail.
          </p>
          <ul className="space-y-2 text-sm text-primary-foreground/85">
            <li>• Ventas en segundos con lector de código de barras</li>
            <li>• Control de inventario en tiempo real</li>
            <li>• Cierre de caja y reportes automáticos</li>
          </ul>
        </div>

        <p className="text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} Mahory · Todos los derechos reservados
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm animate-pop-in">
          <div className="mb-8 lg:hidden">
            <img src="/logo-mahory.png" alt="Mahory" className="size-16 rounded-full shadow-glow" />
          </div>

          <h1 className="font-display text-2xl font-semibold">
            {mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Ingrese sus credenciales para continuar"
              : "El primer usuario registrado será Super Administrador"}
          </p>

          <Tabs
            value={mode}
            onValueChange={(v) => {
              setMode(v as Mode);
              setEmailSent(false);
              form.clearErrors();
            }}
            className="mt-6"
          >
            <TabsList className="grid w-full grid-cols-2 rounded-xl">
              <TabsTrigger value="signin" className="rounded-lg">
                Ingresar
              </TabsTrigger>
              <TabsTrigger value="signup" className="rounded-lg">
                Registrarse
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {emailSent ? (
            <div className="mt-6 rounded-2xl border bg-surface p-5 text-sm">
              <p className="font-medium">Confirme su correo</p>
              <p className="mt-1 text-muted-foreground">
                Le enviamos un enlace de confirmación. Después de confirmarlo podrá iniciar sesión.
              </p>
            </div>
          ) : (
            <form
              onSubmit={form.handleSubmit((values) => submit.mutate(values))}
              className="mt-6 space-y-4"
            >
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nombre completo</Label>
                  <Input
                    id="fullName"
                    placeholder="Juan Pérez"
                    autoComplete="name"
                    className="h-11 rounded-xl"
                    {...form.register("fullName")}
                  />
                  {form.formState.errors.fullName && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.fullName.message}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="correo@tienda.com"
                    autoComplete="email"
                    className="h-11 rounded-xl pl-9"
                    {...form.register("email")}
                  />
                </div>
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    className="h-11 rounded-xl pl-9"
                    {...form.register("password")}
                  />
                </div>
                {form.formState.errors.password && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="h-11 w-full rounded-xl text-base"
                disabled={submit.isPending}
              >
                {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {mode === "signin" ? "Ingresar" : "Crear cuenta"}
              </Button>
            </form>
          )}

          <div className="mt-8 border-t pt-6">
            <Button asChild variant="outline" className="h-12 w-full gap-2 rounded-xl text-base">
              <Link to="/escaner" search={{}}>
                <Smartphone className="size-5" />
                Conectar a una tienda
              </Link>
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              ¿Va a usar este celular como lector de códigos de barras? Conéctelo con el código del
              computador, sin iniciar sesión.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
