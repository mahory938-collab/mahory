import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  CheckCircle2,
  LayoutDashboard,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/manual")({
  head: () => ({
    meta: [
      { title: "Manual — Mahory" },
      { name: "description", content: "Guía de uso de cada módulo del sistema." },
      { property: "og:title", content: "Manual — Mahory" },
      { property: "og:description", content: "Guía de uso de cada módulo del sistema." },
    ],
  }),
  component: ManualPage,
});

type Coverage = { item: string; where: string };

const COVERAGE: Coverage[] = [
  { item: "Compras", where: "Compras" },
  { item: "Proveedores", where: "Proveedores" },
  { item: "Devoluciones", where: "Ventas → detalle de venta" },
  { item: "Ajustes y movimientos de inventario", where: "Inventario → kardex" },
  { item: "Ventas a crédito", where: "Punto de venta + Clientes" },
  { item: "Domicilios", where: "Punto de venta" },
  { item: "Ventas temporales", where: "Punto de venta → Ventas en espera" },
  { item: "Movimientos de caja", where: "Caja" },
  { item: "Estadísticas e informes", where: "Dashboard + Reportes" },
  { item: "Configuración del sistema", where: "Configuración" },
  { item: "Historial de ventas y compras", where: "Ventas + Compras" },
];

type ModuleDef = {
  id: string;
  title: string;
  icon: LucideIcon;
  purpose: string;
  role: "all" | "admin";
  roleLabel?: string;
  steps: string[];
  note?: string;
};

const OPERACION: ModuleDef[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    purpose: "Resumen del día: ventas, ganancias y alertas de stock.",
    role: "all",
    steps: [
      "Vea las ventas de hoy, del mes y el ticket promedio en las tarjetas superiores.",
      "Revise \"Inventario bajo\" para saber qué reponer.",
      "Use \"Acciones rápidas\" para ir directo a vender o ajustar stock.",
    ],
  },
  {
    id: "pos",
    title: "Punto de venta",
    icon: ShoppingCart,
    purpose: "Pantalla de cobro: buscar producto, armar el carrito y cobrar.",
    role: "all",
    steps: [
      "Busque o escanee el producto y toque la tarjeta para agregarlo.",
      "Los descuentos y promociones activas se aplican solos; puede editarlos si tiene permiso.",
      "(Opcional) elija cliente registrado para venta a crédito, o active \"Domicilio\".",
      "\"Cobrar\" y reparta el pago en uno o varios métodos.",
    ],
    note: "\"Ventas en espera\" guarda un carrito a medio armar y lo retoma después sin perderlo.",
  },
  {
    id: "ventas",
    title: "Ventas",
    icon: Package,
    purpose: "Historial de todo lo vendido, con recibo y devoluciones.",
    role: "all",
    steps: [
      "Filtre por fecha, estado o busque por número de venta.",
      "Toque una venta para ver el detalle completo e \"Imprimir recibo\".",
    ],
  },
  {
    id: "caja",
    title: "Caja",
    icon: Wallet,
    purpose: "Abrir y cerrar el turno, y controlar el efectivo. La caja es una sola por tienda: la abre un usuario y queda abierta para todo el equipo, en cualquier equipo.",
    role: "all",
    steps: [
      "Al iniciar el día, ingrese la base inicial en \"Abrir caja\" (solo hace falta que un usuario la abra).",
      "Registre ingresos o egresos con \"Registrar movimiento\".",
      "Revise \"Ventas por método de pago\": efectivo, tarjeta, transferencia y crédito por separado.",
      "Al terminar el día, \"Cerrar caja\" y cuente el efectivo físico contra lo esperado — cierra para todos.",
    ],
  },
];

const CATALOGO: ModuleDef[] = [
  {
    id: "productos",
    title: "Productos",
    icon: Package,
    purpose: "El catálogo: nombre, foto, precio, costo y categoría.",
    role: "all",
    roleLabel: "Ver: todos · Editar: Admin",
    steps: [
      "\"Nuevo producto\" para crear uno, con foto y código de barras.",
      "Defina precio, costo y stock mínimo para las alertas.",
      "Asigne categoría, marca y proveedor.",
    ],
  },
  {
    id: "promociones",
    title: "Promociones",
    icon: Tag,
    purpose: "Descuentos automáticos que se aplican solos en el punto de venta.",
    role: "admin",
    steps: [
      "\"Nueva promoción\" y elija a qué aplica: todos los productos, una categoría o un producto puntual.",
      "Defina el % de descuento y, si quiere, una vigencia (desde/hasta).",
      "Al vender, el producto muestra el descuento y se resta solo del total.",
    ],
  },
  {
    id: "inventario",
    title: "Inventario",
    icon: Boxes,
    purpose: "Existencias reales y el historial de cada movimiento.",
    role: "all",
    roleLabel: "Ver: todos · Ajustar: Admin",
    steps: [
      "Filtre \"Bajo stock\" o \"Agotados\" para ver qué falta.",
      "Toque el ícono de reloj para ver el kardex: cada entrada y salida de ese producto.",
      "Admin: toque el producto para hacer un ajuste manual de stock.",
    ],
  },
  {
    id: "compras",
    title: "Compras",
    icon: Truck,
    purpose: "Órdenes de compra a proveedores y recepción de mercancía.",
    role: "admin",
    steps: [
      "\"Nueva compra\": elija proveedor y agregue productos con cantidad y costo.",
      "La compra queda en Borrador — el stock todavía no cambia.",
      "Abra la compra y toque \"Recibir mercancía\" cuando llegue el pedido: ahí sí se suma el stock.",
    ],
    note: "El stock solo aumenta al \"Recibir mercancía\", nunca al crear la compra.",
  },
  {
    id: "clientes",
    title: "Clientes",
    icon: Users,
    purpose: "Base de clientes, cupo de crédito y saldo pendiente.",
    role: "all",
    steps: [
      "\"Nuevo cliente\" y asigne un cupo de crédito si va a fiarle.",
      "\"Cupo disponible\" y \"Saldo pendiente\" se actualizan solos con cada venta a crédito.",
      "Si el cliente debe, use el ícono de moneda para \"Registrar abono\".",
    ],
  },
  {
    id: "proveedores",
    title: "Proveedores",
    icon: Store,
    purpose: "Datos de contacto para usar al crear una compra.",
    role: "admin",
    steps: [
      "\"Nuevo proveedor\": nombre, contacto y datos fiscales.",
      "Aparecerá disponible al crear una nueva compra.",
    ],
  },
];

const ADMINISTRACION: ModuleDef[] = [
  {
    id: "reportes",
    title: "Reportes",
    icon: BarChart3,
    purpose: "Ventas, ganancias, compras e inventario por rango de fecha.",
    role: "admin",
    steps: [
      "Elija el rango: hoy, 7 días, este mes o todo.",
      "Vea ganancia, ticket promedio y ventas por método de pago.",
      "\"Exportar CSV\" descarga los productos más vendidos para Excel.",
    ],
  },
  {
    id: "usuarios",
    title: "Usuarios",
    icon: UsersRound,
    purpose: "El equipo que tiene acceso al sistema y su rol.",
    role: "admin",
    steps: [
      "\"Nuevo usuario\" para crear una cuenta de acceso.",
      "Cambie el rol entre Vendedor y Administrador desde la lista.",
      "El interruptor de estado activa o desactiva el acceso sin borrar al usuario.",
    ],
  },
  {
    id: "configuracion",
    title: "Configuración",
    icon: Settings,
    purpose: "Datos de la tienda, métodos de pago y recibo impreso.",
    role: "admin",
    steps: [
      "Complete nombre, NIT, dirección y el IVA por defecto de la tienda.",
      "Active o desactive los métodos de pago que acepta el punto de venta.",
      "Elija el ancho del papel térmico (58 o 80 mm) para el recibo.",
      "\"Descargar respaldo\" guarda una copia en JSON de productos, clientes y proveedores.",
    ],
  },
];

function ManualPage() {
  return (
    <AppShell title="Manual" description="Guía de uso de cada módulo del sistema">
      <div className="space-y-8">
        <Card className="overflow-hidden rounded-2xl shadow-soft">
          <CardHeader className="flex-row items-center justify-between gap-3 border-b pb-3">
            <div>
              <CardTitle className="text-base">Cobertura del Plan Pro contratado</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Cada punto incluido en el plan y el módulo donde se cumple.
              </p>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Incluido en el plan</TableHead>
                <TableHead>Se cumple en</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {COVERAGE.map((row) => (
                <TableRow key={row.item}>
                  <TableCell className="font-medium">{row.item}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.where}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="gap-1 rounded-full bg-success/15 text-success"
                    >
                      <CheckCircle2 className="size-3" />
                      Incluido
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <ModuleGroup
          title="Operación"
          subtitle="Lo que se usa todos los días: vender, cobrar y controlar el efectivo."
          modules={OPERACION}
        />
        <ModuleGroup
          title="Catálogo"
          subtitle="Lo que se vende, se compra y a quién se le vende o compra."
          modules={CATALOGO}
        />
        <ModuleGroup
          title="Administración"
          subtitle="Visión del negocio, equipo y ajustes generales — solo Administrador."
          modules={ADMINISTRACION}
        />
      </div>
    </AppShell>
  );
}

function ModuleGroup({
  title,
  subtitle,
  modules,
}: {
  title: string;
  subtitle: string;
  modules: ModuleDef[];
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((mod) => (
          <ModuleCard key={mod.id} mod={mod} />
        ))}
      </div>
    </section>
  );
}

function ModuleCard({ mod }: { mod: ModuleDef }) {
  const Icon = mod.icon;
  return (
    <Card className="rounded-2xl shadow-soft">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft">
            <Icon className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold">{mod.title}</p>
            <p className="text-xs text-muted-foreground">{mod.purpose}</p>
          </div>
        </div>

        <Badge
          variant="outline"
          className={cn(
            "mt-3 rounded-full border-transparent text-xs",
            mod.role === "admin" ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
          )}
        >
          {mod.roleLabel ?? (mod.role === "admin" ? "Solo Administrador" : "Todo el equipo")}
        </Badge>

        <ol className="mt-3 space-y-1.5">
          {mod.steps.map((step, index) => (
            <li key={index} className="flex gap-2 text-xs">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-surface font-display text-[10px] font-semibold text-primary">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {mod.note && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 p-2 text-xs text-warning">
            <Search className="mt-0.5 size-3 shrink-0" />
            <span>{mod.note}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
