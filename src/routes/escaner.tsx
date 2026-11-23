import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  Flashlight,
  FlashlightOff,
  Loader2,
  Package,
  PackageX,
  Pause,
  Play,
  QrCode,
  SearchX,
  ShoppingCart,
  SwitchCamera,
  Tag,
  Unplug,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PhoneRegisterForm } from "@/features/scanner/phone-register-form";
import {
  clearDevice,
  loadDevice,
  loadMode,
  saveDevice,
  saveMode,
  type StoredDevice,
} from "@/features/scanner/phone-storage";
import {
  disconnectOwnScanner,
  lookupDeviceProduct,
  pingScannerDevice,
  redeemScannerPairing,
  setScannerDeviceMode,
  submitDeviceScan,
  type PriceLookupResult,
  type ScannerMode,
  type ScanResult,
  type StockStatus,
} from "@/features/scanner/scanner-server-actions";
import { withTimeout } from "@/features/scanner/scanner-utils";
import {
  CAMERA_PROBLEM_MESSAGES,
  PRODUCT_FORMATS,
  QR_FORMATS,
  useBarcodeCamera,
} from "@/features/scanner/use-barcode-camera";
import { playBeep } from "@/lib/beep";
import { formatCurrency, formatNumber } from "@/lib/format";

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

/** Mientras el celular sigue apuntando al mismo código, no se vuelve a leer hasta que lo aparte. */
const REARM_MS = 1500;
const REQUEST_TIMEOUT_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Failure =
  | { type: "lost"; message: string }
  | { type: "invalid"; message: string }
  | { type: "mode" }
  | { type: "network" };

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
  if (message.includes("MODO_CONSULTA") || message.includes("MODO_VENTAS")) return { type: "mode" };
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
      <div className="grid min-h-dvh place-items-center bg-background">
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
        const paired = await withTimeout(
          redeemScannerPairing({ data: { credential, deviceName } }),
          15_000,
        );
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 overflow-x-hidden bg-background p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/logo-mahory.png" alt="Mahory Kids" className="size-28 object-contain" />
        <h1 className="font-display text-2xl font-semibold">Conectar a una tienda</h1>
        <p className="text-sm text-muted-foreground">
          En el computador, abra el punto de venta y toque <strong>«Conectar celular»</strong>. Luego
          escanee el código QR que aparece allí.
        </p>
      </div>

      {notice && <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">{notice}</p>}
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
    <div className="fixed inset-x-0 top-0 z-50 h-dvh overflow-hidden bg-black text-white">
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
        className="absolute right-4 top-4 z-20 grid size-12 place-items-center rounded-full bg-black/60"
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
              <button type="button" onClick={retry} className="h-12 rounded-xl bg-white px-5 font-semibold text-black">
                Reintentar
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="h-12 rounded-xl border border-white/40 px-5 font-semibold"
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
  | { kind: "price"; result: PriceLookupResult }
  | { kind: "unknown"; barcode: string }
  | { kind: "error"; message: string };

const STATUS_STYLE: Record<StockStatus, { label: string; className: string }> = {
  disponible: { label: "Disponible", className: "bg-emerald-100 text-emerald-700" },
  pocas: { label: "Pocas unidades", className: "bg-amber-100 text-amber-700" },
  agotado: { label: "Agotado", className: "bg-red-100 text-red-700" },
};

function ScanScreen({ device, onLost }: { device: StoredDevice; onLost: (reason: string) => void }) {
  const [mode, setMode] = useState<ScannerMode>(loadMode);
  const [switching, setSwitching] = useState(false);
  const [paused, setPaused] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const lastRaw = useRef<{ text: string; at: number } | null>(null);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocked = useRef(false);
  const modeRef = useRef(mode);
  const lookupSeq = useRef(0);

  const showCard = useCallback((next: Card | null, autoHideMs?: number) => {
    if (cardTimer.current) clearTimeout(cardTimer.current);
    cardTimer.current = null;
    setCard(next);
    if (next && autoHideMs) cardTimer.current = setTimeout(() => setCard(null), autoHideMs);
  }, []);

  useEffect(
    () => () => {
      if (cardTimer.current) clearTimeout(cardTimer.current);
    },
    [],
  );

  useEffect(() => {
    modeRef.current = mode;
    blocked.current =
      paused || switching || registering !== null || confirmingDisconnect || card?.kind === "unknown";
  }, [mode, paused, switching, registering, confirmingDisconnect, card]);

  // ---- Modo ventas: el producto viaja al carrito del computador ----

  const handleSalesResult = useCallback(
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

  const syncMode = useCallback(async () => {
    await withTimeout(
      setScannerDeviceMode({
        data: { deviceId: device.deviceId, deviceSecret: device.deviceSecret, mode: modeRef.current },
      }),
      REQUEST_TIMEOUT_MS,
    );
  }, [device.deviceId, device.deviceSecret]);

  const sendScan = useCallback(
    async (barcode: string) => {
      const eventId = crypto.randomUUID();
      const delays = [0, 800, 2000, 4000];
      setPending((n) => n + 1);
      try {
        for (let i = 0; i < delays.length; i += 1) {
          if (delays[i]) await sleep(delays[i] as number);
          try {
            const result = await withTimeout(
              submitDeviceScan({
                data: { deviceId: device.deviceId, deviceSecret: device.deviceSecret, eventId, barcode },
              }),
              REQUEST_TIMEOUT_MS,
            );
            setOffline(false);
            handleSalesResult(result, barcode);
            return;
          } catch (e) {
            const failure = classify(e);
            if (failure.type === "lost") {
              onLost(failure.message);
              return;
            }
            if (failure.type === "mode") {
              void syncMode().catch(() => undefined);
              showCard({ kind: "error", message: "Se estaba cambiando de modo. Escanee de nuevo." }, 2500);
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
              showCard(
                { kind: "error", message: "Sin conexión. No se pudo enviar el producto; escanéelo de nuevo." },
                4000,
              );
            }
          }
        }
      } finally {
        setPending((n) => n - 1);
      }
    },
    [device.deviceId, device.deviceSecret, handleSalesResult, onLost, showCard, syncMode],
  );

  // ---- Consulta de precios: solo lee, no toca carrito, ventas ni inventario ----

  const lookup = useCallback(
    async (barcode: string) => {
      const seq = ++lookupSeq.current;
      setPending((n) => n + 1);
      try {
        for (let i = 0; i < 2; i += 1) {
          try {
            const result = await withTimeout(
              lookupDeviceProduct({
                data: { deviceId: device.deviceId, deviceSecret: device.deviceSecret, barcode },
              }),
              REQUEST_TIMEOUT_MS,
            );
            if (seq !== lookupSeq.current) return; // ya llegó otro escaneo más reciente
            setOffline(false);
            if (!result.found || !result.product) {
              playBeep("error");
              vibrate([80, 60, 80]);
              showCard({ kind: "unknown", barcode });
            } else {
              playBeep("ok");
              vibrate(40);
              showCard({ kind: "price", result });
            }
            return;
          } catch (e) {
            const failure = classify(e);
            if (failure.type === "lost") {
              onLost(failure.message);
              return;
            }
            if (failure.type === "mode") {
              void syncMode().catch(() => undefined);
              showCard({ kind: "error", message: "Se estaba cambiando de modo. Escanee de nuevo." }, 2500);
              return;
            }
            if (failure.type === "invalid") {
              showCard({ kind: "error", message: failure.message }, 3000);
              return;
            }
            setOffline(true);
            if (i === 0) await sleep(800);
            else if (seq === lookupSeq.current) {
              playBeep("error");
              showCard({ kind: "error", message: "Sin conexión. Intente escanear de nuevo." }, 3500);
            }
          }
        }
      } finally {
        setPending((n) => n - 1);
      }
    },
    [device.deviceId, device.deviceSecret, onLost, showCard, syncMode],
  );

  const handleDetect = useCallback(
    (text: string) => {
      const now = Date.now();
      const previous = lastRaw.current;
      lastRaw.current = { text, at: now };
      if (blocked.current) return;
      // Sigue apuntando al mismo código: no se repite hasta que lo aparte de la cámara.
      if (previous && previous.text === text && now - previous.at < REARM_MS) return;
      if (modeRef.current === "consulta") void lookup(text);
      else void sendScan(text);
    },
    [lookup, sendScan],
  );

  const { videoRef, status, problem, slow, cameras, torchSupported, torchOn, toggleTorch, nextCamera, retry } =
    useBarcodeCamera({ formats: PRODUCT_FORMATS, onDetect: handleDetect });

  const changeMode = async (next: ScannerMode) => {
    if (next === modeRef.current || switching) return;
    setSwitching(true);
    showCard(null);
    try {
      await withTimeout(
        setScannerDeviceMode({ data: { deviceId: device.deviceId, deviceSecret: device.deviceSecret, mode: next } }),
        REQUEST_TIMEOUT_MS,
      );
      modeRef.current = next;
      setMode(next);
      saveMode(next);
      lastRaw.current = null;
    } catch (e) {
      const failure = classify(e);
      if (failure.type === "lost") {
        onLost(failure.message);
        return;
      }
      const message = e instanceof Error ? e.message : "";
      showCard(
        {
          kind: "error",
          message: message.includes("MODOS_NO_ACTIVADOS")
            ? "Falta activar los modos del escáner en la base de datos. Avise al administrador."
            : "No se pudo cambiar de modo. Revise la conexión e intente de nuevo.",
        },
        4000,
      );
    } finally {
      setSwitching(false);
    }
  };

  // Al abrir (o recargar) se confirma el modo con el servidor, que es quien lo hace cumplir.
  useEffect(() => {
    void syncMode().catch((e: unknown) => {
      const failure = classify(e);
      if (failure.type === "lost") onLost(failure.message);
      // Si las columnas de modo aún no existen, queda en "ventas": nada que avisar.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Latido: mantiene "conectado" al celular y detecta si lo desconectaron.
  useEffect(() => {
    const ping = async () => {
      try {
        await withTimeout(
          pingScannerDevice({ data: { deviceId: device.deviceId, deviceSecret: device.deviceSecret } }),
          REQUEST_TIMEOUT_MS,
        );
        setOffline(false);
      } catch (e) {
        const failure = classify(e);
        if (failure.type === "lost") onLost(failure.message);
        else setOffline(true);
      }
    };
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
      await withTimeout(
        disconnectOwnScanner({ data: { deviceId: device.deviceId, deviceSecret: device.deviceSecret } }),
        6000,
      );
    } catch {
      // si no hay red, igual se olvida el dispositivo en este celular
    }
    clearDevice();
    onLost("Celular desconectado. Puede volver a conectarlo cuando quiera.");
  };

  // Al abrir el formulario, la pantalla del lector se desmonta y la cámara se libera sola.
  if (registering) {
    return (
      <PhoneRegisterForm
        device={device}
        barcode={registering}
        mode={mode}
        onCancel={() => {
          lastRaw.current = null;
          setRegistering(null);
          showCard(null);
        }}
        onDone={(result, addedToSale) => {
          // Volver al lector limpio: sin lectura previa y sin pausas ni cargas pendientes.
          lastRaw.current = null;
          setPaused(false);
          setRegistering(null);
          playBeep("ok");
          vibrate(60);
          showCard({ kind: "ok", result, registered: true, addedToSale }, 3500);
        }}
      />
    );
  }

  const inQuery = mode === "consulta";

  return (
    <div className="fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden bg-black text-white">
      <header className="shrink-0 space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs">
            <span className={`size-2.5 shrink-0 rounded-full ${offline ? "bg-amber-400" : "bg-emerald-400"}`} />
            <span className="truncate">
              {offline ? "Sin conexión, reintentando…" : `Conectado a ${device.storeName}`}
            </span>
          </span>
          {(pending > 0 || switching) && <Loader2 className="size-5 shrink-0 animate-spin" />}
        </div>
        <ModeSwitch mode={mode} disabled={switching} onChange={(next) => void changeMode(next)} />
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video ref={videoRef} className="absolute inset-0 size-full object-cover" playsInline muted autoPlay />

        <p className="pointer-events-none absolute inset-x-0 top-3 px-4 text-center text-sm font-medium drop-shadow">
          {paused
            ? "Escaneo en pausa"
            : inQuery
              ? "Apunte al producto para ver su precio"
              : "Apunte al código de barras del producto"}
        </p>

        <div className="pointer-events-none absolute inset-x-0 top-[14%] flex justify-center">
          <div
            className={`h-36 w-[80%] max-w-sm rounded-2xl border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ${
              inQuery ? "border-[#c3a6e8]" : "border-white/80"
            }`}
          />
        </div>

        {status === "starting" && !problem && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-black/60 p-6 text-center">
            <div className="space-y-3">
              <Loader2 className="mx-auto size-9 animate-spin" />
              <p className="text-sm">Iniciando la cámara…</p>
              {slow && (
                <button type="button" onClick={retry} className="h-12 rounded-xl bg-white px-5 font-semibold text-black">
                  Reintentar
                </button>
              )}
            </div>
          </div>
        )}

        {paused && status === "ready" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
            <Pause className="size-16 text-white/80" />
          </div>
        )}

        {card && (
          <div className="absolute inset-x-3 bottom-3">
            <ResultCard
              card={card}
              onDismiss={() => showCard(null)}
              onRegister={(barcode) => setRegistering(barcode)}
            />
          </div>
        )}

        {problem && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/90 p-6 text-center">
            <div className="space-y-4">
              <p className="text-base">{CAMERA_PROBLEM_MESSAGES[problem]}</p>
              <div className="flex justify-center gap-3">
                <button type="button" onClick={retry} className="h-12 rounded-xl bg-white px-5 font-semibold text-black">
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDisconnect(true)}
                  className="h-12 rounded-xl border border-white/40 px-5 font-semibold"
                >
                  Desconectar
                </button>
              </div>
            </div>
          </div>
        )}

        {offline && (
          <div className="pointer-events-none absolute right-3 top-10 flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-black">
            <WifiOff className="size-3.5" />
            Sin internet
          </div>
        )}
      </main>

      <footer className="flex shrink-0 items-start justify-around gap-1 bg-black px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
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
      </footer>

      {confirmingDisconnect && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 p-6">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 text-[#2a1b3d]">
            <p className="text-lg font-semibold">¿Desconectar este celular?</p>
            <p className="text-sm">
              Dejará de enviar productos al computador. Podrá volver a conectarlo con un código nuevo.
            </p>
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

function ModeSwitch({
  mode,
  disabled,
  onChange,
}: {
  mode: ScannerMode;
  disabled: boolean;
  onChange: (mode: ScannerMode) => void;
}) {
  const options: { id: ScannerMode; label: string; icon: typeof Tag }[] = [
    { id: "ventas", label: "Modo ventas", icon: ShoppingCart },
    { id: "consulta", label: "Consulta de precios", icon: Tag },
  ];
  return (
    <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-white/10 p-1">
      {options.map((option) => {
        const active = option.id === mode;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 text-sm font-semibold transition-colors ${
              active ? "bg-[#c3a6e8] text-[#2a1b3d]" : "text-white/80"
            }`}
          >
            <option.icon className="size-4 shrink-0" />
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ResultCard({
  card,
  onDismiss,
  onRegister,
}: {
  card: Card;
  onDismiss: () => void;
  onRegister: (barcode: string) => void;
}) {
  if (card.kind === "price") {
    const product = card.result.product;
    if (!product) return null;
    const style = STATUS_STYLE[product.status];
    return (
      <div className="relative space-y-2 rounded-3xl bg-white p-4 text-[#2a1b3d] shadow-2xl">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          className="absolute right-2 top-2 grid size-10 place-items-center rounded-full text-[#2a1b3d]/50"
        >
          <X className="size-5" />
        </button>
        <div className="flex items-center gap-3 pr-10">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-[#e8dbf4]">
              <Package className="size-7 text-[#8157b8]" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{product.name}</p>
            {product.categoryName && (
              <p className="truncate text-xs text-[#2a1b3d]/60">{product.categoryName}</p>
            )}
          </div>
        </div>
        {product.price > 0 ? (
          <p className="font-display text-5xl font-bold tracking-tight text-[#8157b8]">
            {formatCurrency(product.price)}
          </p>
        ) : (
          <p className="font-display text-3xl font-bold tracking-tight text-amber-600">
            Sin precio asignado
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm">
            Existencias:{" "}
            <strong>
              {formatNumber(product.stock)} {product.stock === 1 ? "unidad" : "unidades"}
            </strong>
          </p>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${style.className}`}>
            {style.label}
          </span>
        </div>
      </div>
    );
  }

  if (card.kind === "ok") {
    return (
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
          <p className="text-sm">
            {card.result.product?.price ? formatCurrency(card.result.product.price) : "Sin precio"}
          </p>
          <p className="text-sm font-semibold text-emerald-600">
            {card.registered ? "Producto registrado" : "Producto agregado"}
            {card.addedToSale ? " · +1 a la venta" : ""}
          </p>
        </div>
      </div>
    );
  }

  if (card.kind === "nostock") {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 text-[#2a1b3d] shadow-2xl">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-red-100">
          <PackageX className="size-7 text-red-600" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{card.result.product?.name}</p>
          <p className="text-sm font-semibold text-red-600">Sin stock · no se agregó a la venta</p>
        </div>
      </div>
    );
  }

  if (card.kind === "error") {
    return <div className="rounded-2xl bg-red-600 p-4 text-sm font-medium shadow-2xl">{card.message}</div>;
  }

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 text-[#2a1b3d] shadow-2xl">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-amber-100">
          <SearchX className="size-6 text-amber-600" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Producto no encontrado</p>
          <p className="text-sm text-[#2a1b3d]/70">No encontramos este producto en el inventario</p>
          <p className="truncate font-mono text-xs text-[#2a1b3d]/50">{card.barcode}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="h-12 rounded-xl border-2 border-[#2a1b3d]/20 text-sm font-semibold"
        >
          Escanear otro producto
        </button>
        <button
          type="button"
          onClick={() => onRegister(card.barcode)}
          className="h-12 rounded-xl bg-[#8157b8] text-sm font-semibold text-white"
        >
          Registrar producto
        </button>
      </div>
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
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-xs font-medium"
    >
      <span
        className={`grid size-14 place-items-center rounded-full ${
          danger ? "bg-red-600/90" : active ? "bg-[#c3a6e8] text-[#2a1b3d]" : "bg-white/15"
        }`}
      >
        {children}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
