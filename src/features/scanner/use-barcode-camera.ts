import { BrowserCodeReader, BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useCallback, useEffect, useRef, useState } from "react";

export type CameraProblem =
  | "permiso"
  | "sin-camara"
  | "ocupada"
  | "no-soportado"
  | "https"
  | "sin-imagen"
  | "otro";

export const CAMERA_PROBLEM_MESSAGES: Record<CameraProblem, string> = {
  permiso: "No hay permiso para usar la cámara. Actívelo en los ajustes del navegador y vuelva a intentar.",
  "sin-camara": "No se encontró ninguna cámara en este dispositivo.",
  ocupada: "La cámara está siendo usada por otra aplicación. Ciérrela e intente de nuevo.",
  "no-soportado": "Este navegador no permite usar la cámara. Pruebe con Chrome o Safari actualizado.",
  https: "La cámara solo funciona en una página segura (https). Abra Mahory con su dirección https.",
  "sin-imagen": "La cámara se abrió pero no muestra imagen. Toque Reintentar.",
  otro: "No se pudo iniciar la cámara. Intente de nuevo.",
};

/** Formatos de comercio más comunes. */
export const PRODUCT_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
];

export const QR_FORMATS = [BarcodeFormat.QR_CODE];

/** Intentos de lectura cada 100 ms (≈10 por segundo): suficiente y liviano para celulares modestos. */
const SCAN_ATTEMPT_DELAY_MS = 100;
const SCAN_SUCCESS_DELAY_MS = 400;
/** Tiempo máximo para que el video muestre imagen real antes de considerarlo fallido. */
const FIRST_FRAME_TIMEOUT_MS = 6000;
/** Tiempo máximo para enganchar la cámara al video (el permiso del usuario NO cuenta aquí). */
const ATTACH_TIMEOUT_MS = 8000;
/** Si sigue "iniciando" después de esto, la pantalla ofrece Reintentar. */
const SLOW_START_MS = 8000;
const MAX_AUTO_RETRIES = 1;

function classify(error: unknown): CameraProblem {
  const name = error instanceof Error ? error.name : "";
  if (name === "InsecureContext") return "https";
  if (name === "Unsupported") return "no-soportado";
  if (name === "NoFrames") return "sin-imagen";
  if (name === "NotAllowedError" || name === "SecurityError") return "permiso";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
    return "sin-camara";
  }
  if (name === "NotReadableError" || name === "TrackStartError") return "ocupada";
  return "otro";
}

function namedError(name: string) {
  return Object.assign(new Error(name), { name });
}

/** Espera a que el video tenga imagen de verdad (no solo que el stream exista). */
function waitForFrames(video: HTMLVideoElement, isCancelled: () => boolean) {
  return new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (isCancelled()) return resolve(false);
      if (video.videoWidth > 0 && video.readyState >= 2 && !video.paused) return resolve(true);
      if (Date.now() - startedAt > FIRST_FRAME_TIMEOUT_MS) return resolve(false);
      setTimeout(check, 100);
    };
    check();
  });
}

/** Espera una promesa, pero no para siempre: si vence, lo que llegue tarde se descarta sin dejar nada vivo. */
function raceTimeout<T>(promise: Promise<T>, ms: number, onLate: (value: T) => void) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(namedError("NoFrames"));
      promise.then(onLate, () => undefined);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** Detiene el lector, TODAS las pistas de la cámara y suelta el video. */
function releaseCamera(
  video: HTMLVideoElement | null,
  controls: IScannerControls | null,
  stream: MediaStream | null,
) {
  try {
    controls?.stop();
  } catch {
    // ya estaba detenido
  }
  const attached = video?.srcObject as MediaStream | null | undefined;
  for (const s of new Set([stream, attached])) s?.getTracks().forEach((track) => track.stop());
  if (video) video.srcObject = null;
}

/**
 * Cámara + lector de códigos (ZXing).
 *
 * Ciclo de vida: la cámara pertenece al elemento <video>. Cuando el <video> aparece, se
 * inicia; cuando desaparece (por ejemplo al abrir el formulario de registro) se detiene y
 * se liberan las pistas; cuando vuelve a aparecer, se inicia de nuevo desde cero. Nunca hay
 * dos streams ni dos bucles de lectura al mismo tiempo, y no se lee ningún código hasta que
 * el video muestra imagen real.
 */
export function useBarcodeCamera(options: {
  formats: BarcodeFormat[];
  onDetect: (text: string) => void;
}) {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onDetectRef = useRef(options.onDetect);
  const formatsRef = useRef(options.formats);
  const readyRef = useRef(false);
  const autoRetries = useRef(0);

  const [status, setStatus] = useState<"starting" | "ready" | "error">("starting");
  const [problem, setProblem] = useState<CameraProblem | null>(null);
  const [slow, setSlow] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onDetectRef.current = options.onDetect;
  });

  // Ref de callback: React nos avisa cada vez que el <video> se monta o se desmonta.
  const videoRef = useCallback((element: HTMLVideoElement | null) => setVideoEl(element), []);

  useEffect(() => {
    if (!videoEl) return;
    const video = videoEl;
    let cancelled = false;

    readyRef.current = false;
    setStatus("starting");
    setProblem(null);
    setSlow(false);
    setTorchOn(false);

    const slowTimer = setTimeout(() => setSlow(true), SLOW_START_MS);

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
      // Al volver de otra app, el celular puede haber cortado la cámara: se reinicia sola.
      if (!track || track.readyState !== "live" || video.paused) setAttempt((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);

    const start = async () => {
      if (!window.isSecureContext) throw namedError("InsecureContext");
      if (!navigator.mediaDevices?.getUserMedia) throw namedError("Unsupported");

      const hints = new Map<DecodeHintType, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, formatsRef.current],
      ]);
      const reader = new BrowserMultiFormatReader(hints as Map<DecodeHintType, never>, {
        delayBetweenScanAttempts: SCAN_ATTEMPT_DELAY_MS,
        delayBetweenScanSuccess: SCAN_SUCCESS_DELAY_MS,
      });

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: cameraId
          ? { deviceId: { exact: cameraId } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      // Pedir la cámara puede tardar lo que tarde el usuario en aceptar el permiso: sin límite.
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (cancelled) return; // el efecto de limpieza libera todo

      // Enganchar la cámara al video SÍ tiene límite: si se cuelga, se reintenta o se avisa.
      const controls = await raceTimeout(
        reader.decodeFromStream(stream, video, (result) => {
          if (result && readyRef.current) onDetectRef.current(result.getText());
        }),
        ATTACH_TIMEOUT_MS,
        (late) => {
          try {
            late.stop();
          } catch {
            // ya estaba detenido
          }
        },
      );
      controlsRef.current = controls;
      if (cancelled) return;

      const rendering = await waitForFrames(video, () => cancelled);
      if (cancelled) return;
      if (!rendering) throw namedError("NoFrames");

      const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
      track?.addEventListener("ended", () => {
        if (!cancelled) setAttempt((n) => n + 1);
      });
      const capabilities = track?.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchSupported(Boolean(capabilities?.torch));
      setActiveId(track?.getSettings().deviceId);

      try {
        const list = await BrowserCodeReader.listVideoInputDevices();
        if (!cancelled) setCameras(list);
      } catch {
        // la lista de cámaras es opcional
      }
      if (cancelled) return;

      autoRetries.current = 0;
      readyRef.current = true;
      clearTimeout(slowTimer);
      setSlow(false);
      setStatus("ready");
    };

    start().catch((error: unknown) => {
      if (cancelled) return;
      clearTimeout(slowTimer);
      releaseCamera(video, controlsRef.current, streamRef.current);
      controlsRef.current = null;
      streamRef.current = null;
      const kind = classify(error);
      // Un video sin imagen suele arreglarse con un segundo intento automático.
      if ((kind === "sin-imagen" || kind === "otro") && autoRetries.current < MAX_AUTO_RETRIES) {
        autoRetries.current += 1;
        setTimeout(() => {
          if (!cancelled) setAttempt((n) => n + 1);
        }, 400);
        return;
      }
      setProblem(kind);
      setStatus("error");
    });

    return () => {
      cancelled = true;
      readyRef.current = false;
      clearTimeout(slowTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      releaseCamera(video, controlsRef.current, streamRef.current);
      controlsRef.current = null;
      streamRef.current = null;
    };
  }, [videoEl, cameraId, attempt]);

  const toggleTorch = useCallback(async () => {
    const track = (videoEl?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn, videoEl]);

  const nextCamera = useCallback(() => {
    if (cameras.length < 2) return;
    const index = cameras.findIndex((c) => c.deviceId === activeId);
    const next = cameras[(index + 1) % cameras.length];
    if (next) setCameraId(next.deviceId);
  }, [cameras, activeId]);

  const retry = useCallback(() => {
    autoRetries.current = 0;
    setAttempt((n) => n + 1);
  }, []);

  return {
    videoRef,
    status,
    problem,
    slow,
    cameras,
    torchSupported,
    torchOn,
    toggleTorch,
    nextCamera,
    retry,
  };
}
