import { AlertTriangle, Loader2, RefreshCw, Smartphone, Unplug } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { disconnectScannerDevice, startScannerPairing } from "@/features/scanner/scanner-server-actions";
import { isDeviceOnline, type ScannerDeviceRow } from "@/features/scanner/use-scanner-session";
import { supabase } from "@/integrations/supabase/client";

type Pairing = { token: string; code: string; expiresAt: number };

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/scanner_|schema cache|does not exist/i.test(message)) {
    return "Falta activar el escáner en la base de datos. Ejecute el SQL del escáner en Supabase y vuelva a intentar.";
  }
  return message || "No se pudo generar el código. Intente de nuevo.";
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function lastSeenLabel(device: ScannerDeviceRow) {
  const seconds = Math.floor((Date.now() - new Date(device.last_seen_at).getTime()) / 1000);
  if (seconds < 60) return "activo ahora";
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `visto hace ${minutes} min` : "sin señal hace rato";
}

export function ScannerPairingDialog({
  open,
  onOpenChange,
  devices,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: ScannerDeviceRow[];
  onChanged: () => void;
}) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const previousCount = useRef(devices.length);
  const generating = useRef(false);

  const generate = useCallback(async () => {
    if (generating.current) return;
    generating.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Su sesión venció. Inicie sesión de nuevo.");
      const result = await startScannerPairing({ data: { accessToken } });
      setPairing({ token: result.token, code: result.code, expiresAt: new Date(result.expiresAt).getTime() });
      onChanged();
    } catch (e) {
      setPairing(null);
      setError(friendlyError(e));
    } finally {
      generating.current = false;
      setLoading(false);
    }
  }, [onChanged]);

  // Al abrir, genera un código nuevo.
  useEffect(() => {
    if (open) void generate();
  }, [open, generate]);

  // Cuenta regresiva; al vencer, genera otro automáticamente.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (open && pairing && now >= pairing.expiresAt) void generate();
  }, [open, pairing, now, generate]);

  // Cada código sirve una vez: cuando entra un celular, se prepara uno nuevo para el siguiente.
  useEffect(() => {
    if (open && devices.length > previousCount.current) {
      toast.success("Celular conectado");
      void generate();
    }
    previousCount.current = devices.length;
  }, [devices.length, open, generate]);

  const handleDisconnect = async (device: ScannerDeviceRow) => {
    setDisconnecting(device.id);
    try {
      const { data } = await supabase.auth.getSession();
      await disconnectScannerDevice({
        data: { accessToken: data.session?.access_token ?? "", deviceId: device.id },
      });
      toast.success(`${device.name} desconectado`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo desconectar el celular");
    } finally {
      setDisconnecting(null);
    }
  };

  const url = pairing ? `${window.location.origin}/escaner?t=${pairing.token}` : "";
  const insecure =
    typeof window !== "undefined" &&
    (window.location.protocol !== "https:" ||
      ["localhost", "127.0.0.1"].includes(window.location.hostname));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="size-5 text-primary" />
            Conectar celular
          </DialogTitle>
          <DialogDescription>
            Use el celular como lector de códigos de barras. Abra Mahory en el celular, toque
            «Conectar a una tienda» y escanee este código.
          </DialogDescription>
        </DialogHeader>

        {insecure && (
          <div className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>
              Está en una dirección local o sin https. Para que el celular pueda abrir la cámara,
              entre a Mahory desde su dirección publicada (https), por ejemplo mahory.vercel.app.
            </p>
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          {error ? (
            <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center text-sm">
              <p>{error}</p>
              <Button variant="outline" className="rounded-xl" onClick={() => void generate()}>
                Reintentar
              </Button>
            </div>
          ) : pairing ? (
            <>
              <div className="rounded-2xl bg-white p-3 shadow-soft">
                <QRCodeSVG value={url} size={190} level="M" bgColor="#ffffff" fgColor="#2a1b3d" />
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">O escriba este código en el celular</p>
                <p className="font-display text-3xl font-bold tracking-[0.25em] text-primary">
                  {pairing.code}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Vence en {formatCountdown(pairing.expiresAt - now)} · sirve una sola vez
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-xl"
                disabled={loading}
                onClick={() => void generate()}
              >
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                Código nuevo
              </Button>
            </>
          ) : (
            <div className="grid h-52 place-items-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Celulares conectados ({devices.length})</p>
          {devices.length === 0 ? (
            <p className="rounded-xl bg-surface p-3 text-sm text-muted-foreground">
              Todavía no hay ningún celular conectado.
            </p>
          ) : (
            devices.map((device) => {
              const online = isDeviceOnline(device);
              return (
                <div
                  key={device.id}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3"
                >
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${online ? "bg-success" : "bg-muted-foreground/40"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{device.name}</p>
                    <p className="text-xs text-muted-foreground">{lastSeenLabel(device)}</p>
                  </div>
                  <Badge variant={online ? "secondary" : "outline"} className="rounded-full">
                    {online ? "Conectado" : "Sin señal"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 rounded-lg text-destructive"
                    disabled={disconnecting === device.id}
                    onClick={() => void handleDisconnect(device)}
                    title="Desconectar dispositivo"
                  >
                    {disconnecting === device.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Unplug className="size-4" />
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
