import { Camera, ChevronDown, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { StoredDevice } from "@/features/scanner/phone-storage";
import {
  getDeviceCategories,
  registerDeviceProduct,
  uploadDeviceProductImage,
  type ScannerMode,
  type ScanResult,
} from "@/features/scanner/scanner-server-actions";
import { withTimeout } from "@/features/scanner/scanner-utils";

type Category = { id: string; name: string };

// Las categorías casi no cambian: se piden una vez y se reutilizan en cada registro.
const categoryCache = new Map<string, { at: number; list: Category[] }>();
const CATEGORY_CACHE_MS = 5 * 60 * 1000;

const digits = (value: string) => value.replace(/[^\d]/g, "");

async function shrinkImage(file: File, maxSide = 1000): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function friendlyRegisterError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SIN_PERMISO_PRODUCTOS")) {
    return "Su usuario no puede registrar productos. Pídale a un administrador que lo haga.";
  }
  if (message.startsWith("CODIGO_DUPLICADO")) {
    const name = message.split(":")[1]?.trim();
    return name
      ? `Ese código ya pertenece a «${name}». No se crean productos repetidos.`
      : "Ese código ya está registrado en otro producto.";
  }
  if (message.includes("CODIGO_INVALIDO")) return "El código leído no es válido. Escanéelo de nuevo.";
  if (/DISPOSITIVO_|SESION_VENCIDA/.test(message)) {
    return "La conexión con el computador terminó. Vuelva a conectar el celular.";
  }
  return message || "No se pudo guardar el producto. Revise la conexión e intente de nuevo.";
}

const inputClass =
  "h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-base text-white placeholder:text-white/40 outline-none focus:border-[#c3a6e8]";
const labelClass = "mb-1 block text-xs font-medium text-white/70";

export function PhoneRegisterForm({
  device,
  barcode,
  mode,
  onDone,
  onCancel,
}: {
  device: StoredDevice;
  barcode: string;
  mode: ScannerMode;
  onDone: (result: ScanResult, addedToSale: boolean) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [minStock, setMinStock] = useState("5");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [addToSale, setAddToSale] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const cached = categoryCache.get(device.deviceId);
    if (cached && Date.now() - cached.at < CATEGORY_CACHE_MS) {
      setCategories(cached.list);
      return;
    }
    let cancelled = false;
    withTimeout(
      getDeviceCategories({ data: { deviceId: device.deviceId, deviceSecret: device.deviceSecret } }),
      10_000,
    )
      .then((list) => {
        categoryCache.set(device.deviceId, { at: Date.now(), list });
        if (!cancelled) setCategories(list);
      })
      .catch(() => {
        // las categorías son opcionales para guardar
      });
    return () => {
      cancelled = true;
    };
  }, [device.deviceId, device.deviceSecret]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const canSave = name.trim().length >= 2 && !saving;
  const willAddToSale = mode === "ventas" && addToSale;

  const handleSave = async () => {
    // Doble toque o doble envío: solo pasa el primero.
    if (!canSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);

    let result: ScanResult | null = null;
    try {
      let imageUrl: string | null = null;
      if (photo) {
        try {
          const form = new FormData();
          form.append("deviceId", device.deviceId);
          form.append("deviceSecret", device.deviceSecret);
          form.append("file", await shrinkImage(photo));
          imageUrl = (await withTimeout(uploadDeviceProductImage({ data: form }), 20_000)).url;
        } catch {
          // la foto es opcional: si falla, el producto se guarda igual
        }
      }

      result = await withTimeout(
        registerDeviceProduct({
          data: {
            deviceId: device.deviceId,
            deviceSecret: device.deviceSecret,
            eventId: crypto.randomUUID(),
            barcode,
            name: name.trim(),
            cost: Number(cost) || 0,
            price: Number(price) || 0,
            stock: Number(stock) || 0,
            minStock: Number(minStock) || 0,
            categoryId: categoryId || null,
            description: description.trim(),
            imageUrl,
            addToSale: willAddToSale,
          },
        }),
        25_000,
      );
    } catch (e) {
      if (mounted.current) setError(friendlyRegisterError(e));
    } finally {
      // Pase lo que pase, el botón vuelve a funcionar.
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }

    if (result) onDone(result, willAddToSale);
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] flex-col bg-[#1a1125] text-white">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <h1 className="font-display text-lg font-semibold">Registrar producto</h1>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="grid size-11 place-items-center rounded-full bg-white/10 disabled:opacity-40"
          aria-label="Cancelar"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4">
        <div className="rounded-xl bg-white/10 px-3 py-2 text-sm">
          <span className="text-white/60">Código de barras: </span>
          <span className="break-all font-mono font-semibold">{barcode}</span>
        </div>

        <div>
          <label className={labelClass}>Nombre del producto</label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Blusa manga larga"
            autoFocus
            autoComplete="off"
          />
        </div>

        <div>
          <label className={labelClass}>Precio de compra</label>
          <input
            className={inputClass}
            inputMode="numeric"
            value={cost}
            onChange={(e) => setCost(digits(e.target.value))}
            placeholder="0"
          />
        </div>

        <div>
          <label className={labelClass}>Precio de venta (opcional)</label>
          <input
            className={inputClass}
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(digits(e.target.value))}
            placeholder="0"
          />
        </div>

        <div>
          <label className={labelClass}>Cantidad inicial</label>
          <input
            className={inputClass}
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(digits(e.target.value))}
            placeholder="0"
          />
        </div>

        <div>
          <label className={labelClass}>Categoría</label>
          <select
            className={`${inputClass} appearance-none`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="" className="text-black">
              Sin categoría
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id} className="text-black">
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Foto (opcional)</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-20 w-full items-center gap-3 rounded-xl border border-dashed border-white/25 bg-white/5 px-3 text-left"
          >
            {photoPreview ? (
              <img src={photoPreview} alt="Foto del producto" className="size-14 rounded-lg object-cover" />
            ) : (
              <span className="grid size-14 place-items-center rounded-lg bg-white/10">
                <Camera className="size-6" />
              </span>
            )}
            <span className="text-sm text-white/80">
              {photoPreview ? "Cambiar foto" : "Tomar una foto del producto"}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          className="flex h-11 items-center gap-1.5 text-sm font-medium text-[#c3a6e8]"
        >
          <ChevronDown className={`size-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
          {moreOpen ? "Ocultar opciones" : "Más opciones"}
        </button>

        {moreOpen && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Avisarme cuando queden</label>
              <input
                className={inputClass}
                inputMode="numeric"
                value={minStock}
                onChange={(e) => setMinStock(digits(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Descripción</label>
              <textarea
                className={`${inputClass} h-24 py-2`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        )}

        {mode === "ventas" && (
          <label className="flex min-h-12 items-center gap-3 rounded-xl bg-white/10 px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={addToSale}
              onChange={(e) => setAddToSale(e.target.checked)}
              className="size-5 accent-[#c3a6e8]"
            />
            Agregar a la venta actual
          </label>
        )}

        {error && <p className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#1a1125] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void handleSave()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#c3a6e8] text-base font-semibold text-[#2a1b3d] disabled:opacity-40"
        >
          {saving && <Loader2 className="size-5 animate-spin" />}
          {saving ? "Guardando…" : "Guardar producto"}
        </button>
      </div>
    </div>
  );
}
