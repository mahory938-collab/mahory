import { BrowserCodeReader, BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useCallback, useEffect, useRef, useState } from "react";

export type CameraProblem = "permiso" | "sin-camara" | "ocupada" | "no-soportado" | "https" | "otro";

export const CAMERA_PROBLEM_MESSAGES: Record<CameraProblem, string> = {
  permiso: "No hay permiso para usar la cámara. Actívelo en los ajustes del navegador y vuelva a intentar.",
  "sin-camara": "No se encontró ninguna cámara en este dispositivo.",
  ocupada: "La cámara está siendo usada por otra aplicación. Ciérrela e intente de nuevo.",
  "no-soportado": "Este navegador no permite usar la cámara. Pruebe con Chrome o Safari actualizado.",
  https: "La cámara solo funciona en una página segura (https). Abra Mahory con su dirección https.",
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

function classify(error: unknown): CameraProblem {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "permiso";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
    return "sin-camara";
  }
  if (name === "NotReadableError" || name === "TrackStartError") return "ocupada";
  return "otro";
}

/**
 * Cámara + lector de códigos (ZXing). Usa la cámara trasera por defecto, permite
 * cambiar de cámara y encender la linterna cuando el dispositivo lo soporta.
 */
export function useBarcodeCamera(options: {
  formats: BarcodeFormat[];
  onDetect: (text: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectRef = useRef(options.onDetect);
  const formatsRef = useRef(options.formats);

  const [status, setStatus] = useState<"starting" | "ready" | "error">("starting");
  const [problem, setProblem] = useState<CameraProblem | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onDetectRef.current = options.onDetect;
  });

  useEffect(() => {
    let cancelled = false;
    setStatus("starting");
    setProblem(null);
    setTorchOn(false);

    const start = async () => {
      if (!window.isSecureContext) throw Object.assign(new Error("https"), { name: "InsecureContext" });
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error("unsupported"), { name: "Unsupported" });
      }

      const hints = new Map<DecodeHintType, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, formatsRef.current],
        [DecodeHintType.TRY_HARDER, true],
      ]);
      const reader = new BrowserMultiFormatReader(hints as Map<DecodeHintType, never>, {
        delayBetweenScanAttempts: 60,
        delayBetweenScanSuccess: 500,
      });

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: cameraId
          ? { deviceId: { exact: cameraId } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      const video = videoRef.current;
      if (!video) return;
      const controls = await reader.decodeFromConstraints(constraints, video, (result) => {
        if (result) onDetectRef.current(result.getText());
      });
      if (cancelled) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;

      const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchSupported(Boolean(capabilities?.torch));
      setActiveId(track?.getSettings().deviceId);

      // Con el permiso ya concedido, ahora sí aparecen todas las cámaras con su nombre.
      try {
        const list = await BrowserCodeReader.listVideoInputDevices();
        if (!cancelled) setCameras(list);
      } catch {
        // la lista de cámaras es opcional
      }
      if (!cancelled) setStatus("ready");
    };

    start().catch((error: unknown) => {
      if (cancelled) return;
      const name = error instanceof Error ? error.name : "";
      setProblem(
        name === "InsecureContext" ? "https" : name === "Unsupported" ? "no-soportado" : classify(error),
      );
      setStatus("error");
    });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [cameraId, attempt]);

  const toggleTorch = useCallback(async () => {
    const track = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn]);

  const nextCamera = useCallback(() => {
    if (cameras.length < 2) return;
    const index = cameras.findIndex((c) => c.deviceId === activeId);
    const next = cameras[(index + 1) % cameras.length];
    if (next) setCameraId(next.deviceId);
  }, [cameras, activeId]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { videoRef, status, problem, cameras, torchSupported, torchOn, toggleTorch, nextCamera, retry };
}
