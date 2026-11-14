import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Boxes,
  HandCoins,
  PackageX,
  Plus,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/features/dashboard/use-dashboard-data";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { roleHasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Inicio — Mahory" },
      {
        name: "description",
        content:
          "Resumen de ventas del día y del mes, ganancias, inventario bajo y estado de caja de su tienda.",
      },
      { property: "og:title", content: "Inicio — Mahory" },
      {
        property: "og:description",
        content: "Indicadores de ventas, ganancias e inventario en tiempo real.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { profile, user, role, isLoading: authLoading } = useAuth();
  const { data, isLoading } = useDashboardData(user?.id ?? null);
  const navigate = useNavigate();
  const [showStats, setShowStats] = useState(false);

  const firstName = (profile?.full_name || "").split(" ")[0];
  const spentToday = (data?.cashMovementsToday.egresos ?? 0) + (data?.expensesToday ?? 0);

  useEffect(() => {
    if (!authLoading && !roleHasPermission(role, "dashboard.view")) {
      navigate({ to: "/pos", replace: true });
    }
  }, [authLoading, role, navigate]);

  if (!authLoading && !roleHasPermission(role, "dashboard.view")) return null;

  return (
    <AppShell
      title={firstName ? `Hola, ${firstName}` : "Inicio"}
      description="Así va su tienda hoy"
      actions={
        <Button asChild className="h-9 gap-2 rounded-lg">
          <Link to="/pos">
            <ShoppingCart className="size-4" />
            <span className="hidden sm:inline">Nueva venta</span>
          </Link>
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Acciones rápidas */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Button
            asChild
            className="h-14 justify-start gap-3 rounded-xl text-base font-semibold shadow-glow"
          >
            <Link to="/pos">
              <ShoppingCart className="size-5" />
              Nueva venta
            </Link>
          </Button>
          <QuickAction to="/productos" icon={Plus} label="Agregar producto" />
          <QuickAction to="/inventario" icon={Boxes} label="Ajustar inventario" />
          <QuickAction to="/caja" icon={Wallet} label="Movimiento de caja" />
        </div>

        {/* Lo más importante de hoy */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Vendido hoy"
            value={formatCurrency(data?.todayTotal)}
            hint={`${formatNumber(data?.todayCount)} ventas`}
            icon={Receipt}
            loading={isLoading}
            tone="primary"
          />
          <KpiCard
            label="Gastado hoy"
            value={formatCurrency(spentToday)}
            hint="Gastos del día más egresos de caja"
            icon={ArrowDownCircle}
            loading={isLoading}
          />
          <KpiCard
            label="Balance de hoy"
            value={formatCurrency((data?.todayTotal ?? 0) - spentToday)}
            hint="Ventas menos gastos. No descuenta lo que costó la mercancía."
            icon={Banknote}
            loading={isLoading}
          />
          <KpiCard
            label="Productos disponibles"
            value={formatNumber(data?.activeProducts)}
            hint={`${formatNumber(data?.outOfStock)} agotados`}
            icon={Boxes}
            loading={isLoading}
          />
        </div>

        {/* Lists */}
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-2xl shadow-soft xl:col-span-2">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Últimas ventas</CardTitle>
              <Button asChild variant="ghost" size="sm" className="rounded-lg">
                <Link to="/ventas">Ver todas</Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 rounded-xl" />
                  ))}
                </div>
              ) : (data?.recentSales.length ?? 0) === 0 ? (
                <EmptyState text="No hay ventas registradas todavía." />
              ) : (
                <div className="divide-y">
                  {data?.recentSales.map((sale) => (
                    <div key={sale.id} className="flex items-center gap-3 py-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft">
                        <Receipt className="size-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          Venta #{sale.number}
                          {sale.customer_name ? ` · ${sale.customer_name}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(sale.created_at)}
                        </p>
                      </div>
                      <p className="font-display text-sm font-semibold">
                        {formatCurrency(sale.total)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {/* Cash summary */}
            <Card className="rounded-2xl shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Resumen de caja</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {isLoading ? (
                  <Skeleton className="h-20 rounded-xl" />
                ) : data?.cash ? (
                  <>
                    <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 text-sm">
                      <span className="text-muted-foreground">Base inicial</span>
                      <span className="font-medium">{formatCurrency(data.cash.opening)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 text-sm">
                      <span className="text-muted-foreground">Esperado en caja</span>
                      <span className="font-medium">{formatCurrency(data.cash.expected)}</span>
                    </div>
                    <Badge className="rounded-full">Caja abierta</Badge>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">No tiene una caja abierta.</p>
                    <Button asChild variant="outline" className="w-full rounded-xl">
                      <Link to="/caja">
                        <Wallet className="mr-2 size-4" />
                        Abrir caja
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cash movements today (separate from product sales revenue) */}
            <Card className="rounded-2xl shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Movimientos de caja de hoy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {isLoading ? (
                  <Skeleton className="h-24 rounded-xl" />
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <HandCoins className="size-3.5 text-success" />
                        Abonos de clientes
                      </span>
                      <span className="font-medium text-success">
                        +{formatCurrency(data?.cashMovementsToday.abonos)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <ArrowUpCircle className="size-3.5 text-success" />
                        Ingresos
                      </span>
                      <span className="font-medium text-success">
                        +{formatCurrency(data?.cashMovementsToday.ingresos)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <ArrowDownCircle className="size-3.5 text-destructive" />
                        Egresos
                      </span>
                      <span className="font-medium text-destructive">
                        -{formatCurrency(data?.cashMovementsToday.egresos)}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Low stock */}
            <Card className="rounded-2xl shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4 text-warning" />
                  Por agotarse
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {isLoading ? (
                  <Skeleton className="h-24 rounded-xl" />
                ) : (
                  <>
                    {(data?.lowStock.length ?? 0) === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Por ahora no hay productos por agotarse.
                      </p>
                    )}
                    {data?.lowStock.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2.5"
                      >
                        <span className="truncate text-sm">{p.name}</span>
                        <Badge variant="outline" className="shrink-0 rounded-full text-xs">
                          {formatNumber(p.stock)} / {formatNumber(p.min_stock)}
                        </Badge>
                      </div>
                    ))}
                    {(data?.outOfStock ?? 0) > 0 && (
                      <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
                        <PackageX className="size-4 shrink-0 text-destructive" />
                        <span>{formatNumber(data?.outOfStock)} productos agotados</span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div>
          <Button
            variant="ghost"
            onClick={() => setShowStats((open) => !open)}
            aria-expanded={showStats}
            className="gap-2 rounded-xl text-sm"
          >
            <BarChart3 className="size-4" />
            {showStats ? "Ocultar estadísticas del mes" : "Ver estadísticas del mes"}
          </Button>
        </div>

        {showStats && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard
                label="Ventas del mes"
                value={formatCurrency(data?.monthTotal)}
                hint={`${formatNumber(data?.monthCount)} ventas este mes`}
                icon={TrendingUp}
                loading={isLoading}
              />
              <KpiCard
                label="Ganancia del mes"
                value={formatCurrency(data?.monthProfit)}
                hint="Ventas menos lo que costó la mercancía. No descuenta gastos."
                icon={Banknote}
                loading={isLoading}
              />
              <KpiCard
                label="Venta promedio"
                value={formatCurrency(data?.ticketAverage)}
                hint="Lo que deja cada venta en promedio este mes"
                icon={ArrowUpRight}
                loading={isLoading}
              />
            </div>

        {/* Charts */}
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-2xl shadow-soft xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ventas de los últimos 14 días</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {isLoading ? (
                <Skeleton className="size-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.salesByDay ?? []}>
                    <defs>
                      <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--color-muted-foreground)"
                    />
                    <YAxis
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={44}
                      stroke="var(--color-muted-foreground)"
                    />
                    <Tooltip
                      formatter={(v) => formatCurrency(Number(v))}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--color-border)",
                        background: "var(--color-card)",
                        color: "var(--color-card-foreground)",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="Ventas"
                      stroke="var(--color-chart-1)"
                      strokeWidth={2.5}
                      fill="url(#salesFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Productos más vendidos</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {isLoading ? (
                <Skeleton className="size-full rounded-xl" />
              ) : (data?.topProducts.length ?? 0) === 0 ? (
                <EmptyState text="Aún no hay ventas registradas este mes." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.topProducts ?? []} layout="vertical" margin={{ left: 8 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke="var(--color-muted-foreground)"
                    />
                    <Tooltip
                      formatter={(v) => `${formatNumber(Number(v))} und.`}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--color-border)",
                        background: "var(--color-card)",
                        color: "var(--color-card-foreground)",
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="quantity"
                      name="Cantidad"
                      fill="var(--color-chart-1)"
                      radius={[0, 8, 8, 0]}
                      barSize={18}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

          </div>
        )}
      </div>
    </AppShell>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Receipt;
  loading: boolean;
  tone?: "primary";
}) {
  return (
    <Card className="overflow-hidden rounded-2xl shadow-soft transition-shadow hover:shadow-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div
            className={
              tone === "primary"
                ? "grid size-9 place-items-center rounded-xl bg-gradient-brand"
                : "grid size-9 place-items-center rounded-xl bg-primary-soft"
            }
          >
            <Icon
              className={tone === "primary" ? "size-4 text-primary-foreground" : "size-4 text-primary"}
            />
          </div>
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-32 rounded-lg" />
        ) : (
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight">{value}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: "/pos" | "/productos" | "/inventario" | "/caja";
  icon: typeof Receipt;
  label: string;
}) {
  return (
    <Button
      asChild
      variant="outline"
      className="h-14 justify-start gap-3 rounded-xl text-sm font-medium"
    >
      <Link to={to}>
        <span className="grid size-8 place-items-center rounded-lg bg-primary-soft">
          <Icon className="size-4 text-primary" />
        </span>
        {label}
      </Link>
    </Button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
