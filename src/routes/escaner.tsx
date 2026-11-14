import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  Flashlight,
  FlashlightOff,
  Loader2,
  PackageX,
  Pause,
  Play,
  QrCode,
  SearchX,
  SwitchCamera,
  Unplug,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PhoneRegisterForm } from "@/features/scanner/phone-register-form";
import { clearDevice, loadDevice, saveDevice, type StoredDevice } from "@/features/scanner/phone-storage";
import {
  disconnectOwnScanner,
  pingScannerDevice,
  redeemScannerPairing,
  submitDeviceScan,
  type ScanResult,
} from "@/features/scanner/scanner-server-actions";
import {
  CAMERA_PROBLEM_MESSAGES,
  PRODUCT_FORMATS,
  QR_FORMATS,
  useBarcodeCamera,
} from "@/features/scanner/use-barcode-camera";
import { playBeep } from "@/lib/beep";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/escaner")({
  validateSearch: (search: Record<string, unknown>): { t?: string } =>
    typeof search["t"] === "string" ? { t: search["t"] } : {},
  head: () => ({
    meta: [
      { title: "Escáner — Mahory" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Use el celular como lector de códigos de barras de Mahory." },
    ],
  }),
  component: ScannerPage,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Failure = { type: "lost" | "invalid"; message: string } | { type: "network" };

function classify(error: unknown): Failure {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("DISPOSITIVO_DESCONECTADO")) {
    return { type: "lost", message: "El computador desconectó este celular. Si fue un error, conéctelo de nuevo." };
  }
  if (message.includes("DISPOSITIVO_INVALIDO")) {
    return { type: "lost", message: "Este celular ya no está conectado a la tienda. Vuelva a conectarlo." };
  }
  if (message.includes("SESION_VENCIDA")) {
    return { type: "lost", message: "La conexión con el computador venció. Genere un código nuevo y conéctese otra vez." };
  }
  if (message.includes("CODIGO_INVALIDO") || message.includes("EVENTO_INVALIDO")) {
    return { type: "invalid", message: "No se pudo leer bien ese código. Intente de nuevo." };
  }
  return { type: "network" };
}

function defaultDeviceName() {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const base = /iPhone|iPad/.test(agent) ? "iPhone" : /Android/.test(agent) ? "Android" : "Celular";
  return `${base} ${Math.floor(100 + Math.random() * 900)}`;
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // sin vibración
  }
}

function ScannerPage() {
  const { t } = Route.useSearch();
  const navigate = useNavigate();
  const [device, setDevice] = useState<StoredDevice | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDevice(loadDevice());
  }, []);

  const handlePaired = (paired: StoredDevice) => {
    saveDevice(paired);
    setDevice(paired);
    setNotice(null);
    void navigate({ to: "/escaner", search: {}, replace: true });
  };

  const handleLost = useCallback((reason: string) => {
    clearDevice();
    setDevice(null);
    setNotice(reason);
  }, []);

  if (device === undefined) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!device) {
    return <ConnectScreen token={t} notice={notice} onPaired={handlePaired} />;
  }

  return <ScanScreen device={device} onLost={handleLost} />;
}

// ---------------------------------------------------------------------------
// Conectar a una tienda
// ---------------------------------------------------------------------------

function ConnectScreen({
  token,
  notice,
  onPaired,
}: {
  token: string | undefined;
  notice: string | null;
  onPaired: (device: StoredDevice) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState(defaultDeviceName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrMode, setQrMode] = useState(false);
  const autoTried = useRef(false);

  const redeem = useCallback(
    async (credential: string, deviceName: string) => {
      setBusy(true);
      setError(null);
      try {
        const paired = await redeemScannerPairing({ data: { credential, deviceName } });
        onPaired({
          deviceId: paired.deviceId,
          deviceSecret: paired.deviceSecret,
          deviceName: paired.deviceName,
          storeName: paired.storeName,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        setError(
          /scanner_|schema cache|does not exist/i.test(message)
            ? "El escáner todavía no está activado en esta tienda. Avise al administrador."
            : message || "No se pudo conectar. Intente de nuevo.",
        );
        setBusy(false);
        setQrMode(false);
      }
    },
    [onPaired],
  );

  // Si el celular abrió el enlace del QR (con la cámara normal), conecta solo.
  useEffect(() => {
    if (token && !autoTried.current) {
      autoTried.current = true;
      void redeem(token, name);
    }
  }, [token, name, redeem]);

  if (qrMode) {
    return <QrScanner onResult={(text) => void redeem(text, name)} onCancel={() => setQrMode(false)} />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-background p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/logo-mahory.png" alt="Mahory" className="size-20 rounded-full shadow-glow" />
        <h1 className="font-display text-2xl font-semibold">Conectar a una tienda</h1>
        <p className="text-sm text-muted-foreground">
          En el computador, abra el punto de venta y toque <strong>«Conectar celular»</strong>. Luego
          escanee el código QR que aparece allí.
        </p>
      </div>

      {notice && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">{notice}</p>
      )}
      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {busy ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm">Conectando…</p>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setQrMode(true)}
            className="flex h-16 items-center justify-center gap-3 rounded-2xl bg-primary text-lg font-semibold text-primary-foreground shadow-glow"
          >
            <QrCode className="size-6" />
            Escanear código QR
          </button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            o escriba el código
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9))}
              placeholder="ABCD-EFGH"
              autoCapitalize="characters"
              autoComplete="off"
              className="h-14 w-full rounded-2xl border bg-card text-center font-display text-2xl font-bold tracking-[0.25em] outline-none focus:border-primary"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Nombre de este celular"
              className="h-12 w-full rounded-2xl border bg-card px-4 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={code.replace("-", "").length < 8}
              onClick={() => void redeem(code, name)}
              className="h-14 w-full rounded-2xl border-2 border-primary text-base font-semibold text-primary disabled:opacity-40"
            >
              Conectar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function QrScanner({ onResult, onCancel }: { onResult: (text: string) => void; onCancel: () => void }) {
  const done = useRef(false);
  const { videoRef, status, problem, retry } = useBarcodeCamera({
    formats: QR_FORMATS,
    onDetect: (text) => {
      if (done.current) return;
      done.current = true;
      vibrate(60);
      onResult(text);
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      <video ref={videoRef} className="absolute inset-0 size-full object-cover" playsInline muted autoPlay />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="size-64 rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
      </div>
      <p className="absolute inset-x-0 top-20 text-center text-sm font-medium drop-shadow">
        Apunte al código QR del computador
      </p>
      <button
        type="button"
        onClick={onCancel}
        className="absolute right-4 top-4 z-20 grid size-11 place-items-center rounded-full bg-black/60"
        aria-label="Cancelar"
      >
        <X className="size-5" />
      </button>
      {status === "starting" && (
        <div className="absolute inset-0 grid place-items-center bg-black/60">
          <Loader2 className="size-8 animate-spin" />
        </div>
      )}
      {problem && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/85 p-6 text-center">
          <div className="space-y-4">
            <p>{CAMERA_PROBLEM_MESSAGES[problem]}</p>
            <div className="flex justify-center gap-3">
              <button type="button" onClick={retry} className="rounded-xl bg-white px-5 py-3 font-semibold text-black">
                Reintentar
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-white/40 px-5 py-3 font-semibold"
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Escanear productos
// ---------------------------------------------------------------------------

type Card =
  | { kind: "ok"; result: ScanResult; registered?: boolean; addedToSale?: boolean }
  | { kind: "nostock"; result: ScanResult }
  | { kind: "unknown"; barcode: string }
  | { kind: "error"; message: string };

function ScanScreen({ device, onLost }: { device: StoredDevice; onLost: (reason: string) => void }) {
  const [paused, setPaused] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const lastRead = useRef<{ text: string; at: number } | null>(null);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocked = useRef(false);

  const credentials = { deviceId: device.deviceId, deviceSecret: device.deviceSecret };

  const showCard = useCallback((next: Card, autoHideMs?: number) => {
    if (cardTimer.current) clearTimeout(cardTimer.current);
    setCard(next);
    if (autoHideMs) cardTimer.current = setTimeout(() => setCard(null), autoHideMs);
  }, []);

  useEffect(() => {
    blocked.current = paused || registering !== null || confirmingDisconnect || card?.kind === "unknown";
  }, [paused, registering, confirmingDisconnect, card]);

  const handleResult = useCallback(
    (result: ScanResult, barcode: string) => {
      if (result.ignored) return;
      if (!result.found || !result.product) {
        playBeep("error");
        vibrate([80, 60, 80]);
        showCard({ kind: "unknown", barcode });
      } else if (result.product.stock <= 0) {
        playBeep("error");
        vibrate([80, 60, 80]);
        showCard({ kind: "nostock", result }, 3500);
      } else {
        playBeep("ok");
        vibrate(60);
        showCard({ kind: "ok", result, addedToSale: true }, 2500);
      }
    },
    [showCard],
  );

  const sendScan = useCallback(
    async (barcode: string) => {
      const eventId = crypto.randomUUID();
      const delays = [0, 800, 2000, 4000];
      setPending((n) => n + 1);
      try {
        for (let i = 0; i < delays.length; i += 1) {
          if (delays[i]) await sleep(delays[i] as number);
          try {
            const result = await submitDeviceScan({
              data: { deviceId: device.deviceId, deviceSecret: device.deviceSecret, eventId, barcode },
            });
            setOffline(false);
            handleResult(result, barcode);
            return;
          } catch (e) {
            const failure = classify(e);
            if (failure.type === "lost") {
              onLost(failure.message);
              return;
            }
            if (failure.type === "invalid") {
              showCard({ kind: "error", message: failure.message }, 3000);
              return;
            }
            // Sin conexión: se reintenta con el MISMO evento, así nunca se cuenta dos veces.
            setOffline(true);
            if (i === delays.length - 1) {
              playBeep("error");
              showCard({ kind: "error", message: "Sin conexión. No se pudo enviar el producto; escanéelo de nuevo." }, 4000);
            }
          }
        }
      } finally {
        setPending((n) => n - 1);
      }
    },
    [device.deviceId, device.deviceSecret, handleResult, onLost, showCard],
  );

  const handleDetect = useCallback(
    (text: string) => {
      if (blocked.current) return;
      const now = Date.now();
      const last = lastRead.current;
      if (last && last.text === text && now - last.at < 2000) return;
      lastRead.current = { text, at: now };
      void sendScan(text);
    },
    [sendScan],
  );

  const { videoRef, status, problem, cameras, torchSupported, torchOn, toggleTorch, nextCamera, retry } =
    useBarcodeCamera({ formats: PRODUCT_FORMATS, onDetect: handleDetect });

  // Latido: mantiene "conectado" al celular y detecta si lo desconectaron.
  useEffect(() => {
    const ping = async () => {
      try {
        await pingScannerDevice({ data: { deviceId: device.deviceId, deviceSecret: device.deviceSecret } });
        setOffline(false);
      } catch (e) {
        const failure = classify(e);
        if (failure.type === "lost") onLost(failure.message);
        else setOffline(true);
      }
    };
    void ping();
    const timer = setInterval(() => void ping(), 20_000);
    const goOnline = () => void ping();
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [device.deviceId, device.deviceSecret, onLost]);

  const disconnect = async () => {
    try {
      await disconnectOwnScanner({ data: credentials });
    } catch {
      // si no hay red, igual se olvida el dispositivo en este celular
    }
    clearDevice();
    onLost("Celular desconectado. Puede volver a conectarlo cuando quiera.");
  };

  if (registering) {
    return (
      <PhoneRegisterForm
        device={device}
        barcode={registering}
        onCancel={() => {
          setRegistering(null);
          setCard(null);
        }}
        onDone={(result, addedToSale) => {
          setRegistering(null);
          playBeep("ok");
          vibrate(60);
          showCard({ kind: "ok", result, registered: true, addedToSale }, 3500);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      <video ref={videoRef} className="absolute inset-0 size-full object-cover" playsInline muted autoPlay />

      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="relative h-44 w-[80%] max-w-sm rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
          {!paused && <span className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-[#c3a6e8]" />}
        </div>
      </div>

      {/* Barra superior */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
        <span className="flex min-w-0 items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-xs">
          <span className={`size-2.5 shrink-0 rounded-full ${offline ? "bg-amber-400" : "bg-emerald-400"}`} />
          <span className="truncate">
            {offline ? "Sin conexión, reintentando…" : `Conectado a ${device.storeName}`}
          </span>
        </span>
        {pending > 0 && <Loader2 className="size-5 shrink-0 animate-spin" />}
      </div>

      <p className="absolute inset-x-0 top-16 text-center text-sm font-medium drop-shadow">
        {paused ? "Escaneo en pausa" : "Apunte al código de barras del producto"}
      </p>

      {status === "starting" && !problem && (
        <div className="absolute inset-0 grid place-items-center bg-black/50">
          <Loader2 className="size-9 animate-spin" />
        </div>
      )}

      {paused && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
          <Pause className="size-16 text-white/80" />
        </div>
      )}

      {/* Resultado del último escaneo */}
      {card && (
        <div className="absolute inset-x-0 bottom-32 mx-auto w-[92%] max-w-md">
          {card.kind === "ok" && (
            <div className="flex items-center gap-3 rounded-2xl bg-white p-3 text-[#2a1b3d] shadow-2xl">
              {card.result.product?.imageUrl ? (
                <img src={card.result.product.imageUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-emerald-100">
                  <CheckCircle2 className="size-8 text-emerald-600" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{card.result.product?.name}</p>
                <p className="text-sm">{formatCurrency(card.result.product?.price)}</p>
                <p className="text-sm font-semibold text-emerald-600">
                  {card.registered ? "Producto registrado" : "Producto agregado"}
                  {card.addedToSale ? " · +1 a la venta" : ""}
                </p>
              </div>
            </div>
          )}

          {card.kind === "nostock" && (
            <div className="flex items-center gap-3 rounded-2xl bg-white p-3 text-[#2a1b3d] shadow-2xl">
              <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-red-100">
                <PackageX className="size-7 text-red-600" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{card.result.product?.name}</p>
                <p className="text-sm font-semibold text-red-600">Sin stock · no se agregó a la venta</p>
              </div>
            </div>
          )}

          {card.kind === "error" && (
            <div className="rounded-2xl bg-red-600 p-4 text-sm font-medium shadow-2xl">{card.message}</div>
          )}

          {card.kind === "unknown" && (
            <div className="space-y-3 rounded-2xl bg-white p-4 text-[#2a1b3d] shadow-2xl">
              <div className="flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-amber-100">
                  <SearchX className="size-6 text-amber-600" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">Producto no encontrado</p>
                  <p className="truncate font-mono text-sm text-[#2a1b3d]/70">{card.barcode}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCard(null)}
                  className="h-12 rounded-xl border-2 border-[#2a1b3d]/20 text-sm font-semibold"
                >
                  Seguir escaneando
                </button>
                <button
                  type="button"
                  onClick={() => setRegistering(card.barcode)}
                  className="h-12 rounded-xl bg-[#8157b8] text-sm font-semibold text-white"
                >
                  Registrar producto
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controles */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-4 bg-gradient-to-t from-black/80 to-transparent p-4 pb-6">
        <ControlButton label={paused ? "Seguir" : "Pausar"} onClick={() => setPaused((p) => !p)}>
          {paused ? <Play className="size-6" /> : <Pause className="size-6" />}
        </ControlButton>
        {torchSupported && (
          <ControlButton label="Linterna" active={torchOn} onClick={() => void toggleTorch()}>
            {torchOn ? <FlashlightOff className="size-6" /> : <Flashlight className="size-6" />}
          </ControlButton>
        )}
        {cameras.length > 1 && (
          <ControlButton label="Cámara" onClick={nextCamera}>
            <SwitchCamera className="size-6" />
          </ControlButton>
        )}
        <ControlButton label="Desconectar" danger onClick={() => setConfirmingDisconnect(true)}>
          <Unplug className="size-6" />
        </ControlButton>
      </div>

      {offline && (
        <div className="pointer-events-none absolute right-3 top-14 flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-black">
          <WifiOff className="size-3.5" />
          Sin internet
        </div>
      )}

      {problem && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/90 p-6 text-center">
          <div className="space-y-4">
            <p className="text-base">{CAMERA_PROBLEM_MESSAGES[problem]}</p>
            <div className="flex justify-center gap-3">
              <button type="button" onClick={retry} className="rounded-xl bg-white px-5 py-3 font-semibold text-black">
                Reintentar
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDisconnect(true)}
                className="rounded-xl border border-white/40 px-5 py-3 font-semibold"
              >
                Desconectar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingDisconnect && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-6">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 text-[#2a1b3d]">
            <p className="text-lg font-semibold">¿Desconectar este celular?</p>
            <p className="text-sm">Dejará de enviar productos al computador. Podrá volver a conectarlo con un código nuevo.</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDisconnect(false)}
                className="h-12 rounded-xl border-2 border-[#2a1b3d]/20 font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void disconnect()}
                className="h-12 rounded-xl bg-red-600 font-semibold text-white"
              >
                Desconectar dispositivo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
  active,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-20 flex-col items-center gap-1.5 text-xs font-medium">
      <span
        className={`grid size-14 place-items-center rounded-full ${
          danger ? "bg-red-600/90" : active ? "bg-[#c3a6e8] text-[#2a1b3d]" : "bg-white/20"
        }`}
      >
        {children}
      </span>
      {label}
    </button>
  );
}
