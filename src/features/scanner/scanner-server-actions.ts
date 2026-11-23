import { barcodeVariants } from "@/lib/barcode";
import { createServerFn } from "@tanstack/react-start";

/**
 * Escáner de celular. El POS (computador) inicia sesión normal; el celular NO tiene
 * usuario: se empareja con un código temporal y desde ese momento se identifica con
 * una llave propia (deviceId + deviceSecret). Todo pasa por aquí, con service_role,
 * y el servidor valida cada paso. Los códigos y llaves se guardan solo como hash.
 */

const PAIRING_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 1500;
const MAX_ACTIVE_DEVICES = 10;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O, 0, I, 1

export type ScannedProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  stock: number;
};

export type ScanResult = {
  eventId: string;
  found: boolean;
  ignored?: boolean;
  duplicate?: boolean;
  product: ScannedProduct | null;
};

export type ScannerMode = "ventas" | "consulta";

export type StockStatus = "disponible" | "pocas" | "agotado";

/** Lo único que ve el empleado al consultar un precio: sin costos, márgenes ni identificadores internos. */
export type PriceLookupResult = {
  found: boolean;
  product: {
    name: string;
    price: number;
    stock: number;
    status: StockStatus;
    categoryName: string | null;
    imageUrl: string | null;
  } | null;
};

/** Si la columna "mode" todavía no existe en la base, todo se comporta como "ventas". */
function deviceMode(device: { mode?: string | null }): ScannerMode {
  return device.mode === "consulta" ? "consulta" : "ventas";
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Admin = Awaited<ReturnType<typeof getAdmin>>;

async function sha256(text: string) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomBase64Url(bytes: number) {
  const array = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const b of array) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomCode(length: number) {
  const array = crypto.getRandomValues(new Uint8Array(length));
  return [...array].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BARCODE_RE = /^[A-Za-z0-9\-.$/+% ]{3,64}$/;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function requireUser(accessToken: string) {
  const admin = await getAdmin();
  const { data, error } = await admin.auth.getUser(accessToken ?? "");
  if (error || !data.user) throw new Error("Sesión inválida. Inicie sesión nuevamente.");

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
  if (!roles?.length) throw new Error("Su usuario no tiene un rol asignado.");
  const isAdmin = roles.some((r) => r.role === "admin" || r.role === "super_admin");
  return { admin, user: data.user, isAdmin };
}

async function resolveStoreId(admin: Admin, userId: string) {
  const { data: profile } = await admin.from("profiles").select("store_id").eq("id", userId).maybeSingle();
  if (profile?.store_id) return profile.store_id;
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return store?.id ?? null;
}

/** Valida al celular. Los errores llevan un código fijo que la pantalla del celular traduce. */
async function requireDevice(deviceId: string, deviceSecret: string) {
  if (!UUID_RE.test(deviceId ?? "") || !deviceSecret) throw new Error("DISPOSITIVO_INVALIDO");
  const admin = await getAdmin();

  const { data: device } = await admin.from("scanner_devices").select("*").eq("id", deviceId).maybeSingle();
  if (!device || !safeEqual(await sha256(deviceSecret), device.secret_hash)) {
    throw new Error("DISPOSITIVO_INVALIDO");
  }
  if (device.disconnected_at) throw new Error("DISPOSITIVO_DESCONECTADO");

  const { data: session } = await admin
    .from("scanner_sessions")
    .select("id, store_id, owner_id, expires_at, closed_at")
    .eq("id", device.session_id)
    .maybeSingle();
  if (!session || session.closed_at || new Date(session.expires_at).getTime() < Date.now()) {
    throw new Error("SESION_VENCIDA");
  }
  return { admin, device, session };
}

function toResult(
  event: {
    event_id: string;
    found: boolean;
    product_id: string | null;
    product_name: string | null;
    unit_price: number | null;
    image_url: string | null;
  },
  stock: number,
  extra: Partial<ScanResult> = {},
): ScanResult {
  return {
    eventId: event.event_id,
    found: event.found,
    product:
      event.found && event.product_id
        ? {
            id: event.product_id,
            name: event.product_name ?? "",
            price: Number(event.unit_price ?? 0),
            imageUrl: event.image_url,
            stock,
          }
        : null,
    ...extra,
  };
}

async function stockOf(admin: Admin, productId: string | null) {
  if (!productId) return 0;
  const { data } = await admin.from("products").select("stock").eq("id", productId).maybeSingle();
  return Number(data?.stock ?? 0);
}

// ---------------------------------------------------------------------------
// Lado del computador (usuario con sesión)
// ---------------------------------------------------------------------------

/** Crea (o reutiliza) la sesión de escaneo del usuario y genera un código temporal de un solo uso. */
export const startScannerPairing = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { accessToken: string })
  .handler(async ({ data }) => {
    const { admin, user } = await requireUser(data.accessToken);
    const now = new Date();

    const { data: existing } = await admin
      .from("scanner_sessions")
      .select("id, store_id")
      .eq("owner_id", user.id)
      .is("closed_at", null)
      .gt("expires_at", now.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let session = existing;
    if (!session) {
      const storeId = await resolveStoreId(admin, user.id);
      const { data: created, error } = await admin
        .from("scanner_sessions")
        .insert({
          owner_id: user.id,
          store_id: storeId,
          expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
        })
        .select("id, store_id")
        .single();
      if (error || !created) throw new Error("No se pudo iniciar la conexión de celulares.");
      session = created;
    }

    // Limpieza: códigos vencidos o ya usados de esta sesión.
    await admin.from("scanner_pairings").delete().eq("session_id", session.id).lt("expires_at", now.toISOString());
    await admin.from("scanner_pairings").delete().eq("session_id", session.id).not("used_at", "is", null);

    const token = randomBase64Url(24);
    const code = randomCode(8);
    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);

    const { error: pairingError } = await admin.from("scanner_pairings").insert({
      session_id: session.id,
      token_hash: await sha256(token),
      code_hash: await sha256(code),
      expires_at: expiresAt.toISOString(),
    });
    if (pairingError) throw new Error("No se pudo generar el código de conexión.");

    return {
      sessionId: session.id,
      token,
      code: `${code.slice(0, 4)}-${code.slice(4)}`,
      expiresAt: expiresAt.toISOString(),
    };
  });

/** Desconecta un celular desde el computador. Solo el dueño de la sesión o un administrador. */
export const disconnectScannerDevice = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { accessToken: string; deviceId: string })
  .handler(async ({ data }) => {
    const { admin, user, isAdmin } = await requireUser(data.accessToken);
    if (!UUID_RE.test(data.deviceId ?? "")) throw new Error("Celular no válido.");

    const { data: device } = await admin
      .from("scanner_devices")
      .select("id, owner_id")
      .eq("id", data.deviceId)
      .maybeSingle();
    if (!device) throw new Error("No se encontró ese celular.");
    if (device.owner_id !== user.id && !isAdmin) throw new Error("No puede desconectar este celular.");

    const { error } = await admin
      .from("scanner_devices")
      .update({ disconnected_at: new Date().toISOString() })
      .eq("id", device.id);
    if (error) throw new Error("No se pudo desconectar el celular.");
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Lado del celular (sin usuario; se identifica con su llave)
// ---------------------------------------------------------------------------

/** El celular canjea el código del QR (o el escrito a mano) y recibe su llave propia. */
export const redeemScannerPairing = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { credential: string; deviceName: string })
  .handler(async ({ data }) => {
    const admin = await getAdmin();

    let credential = String(data.credential ?? "").trim();
    try {
      const fromUrl = new URL(credential).searchParams.get("t");
      if (fromUrl) credential = fromUrl;
    } catch {
      // no era un enlace: es el token o el código escrito
    }
    if (!credential) throw new Error("Escriba el código que aparece en el computador.");

    const typedCode = credential.replace(/[\s-]/g, "").toUpperCase();
    const isCode = typedCode.length <= 10;
    const hash = await sha256(isCode ? typedCode : credential);

    const { data: pairing } = await admin
      .from("scanner_pairings")
      .select("id, session_id, expires_at, used_at")
      .eq(isCode ? "code_hash" : "token_hash", hash)
      .maybeSingle();

    if (!pairing) throw new Error("Código no válido. Revíselo o genere uno nuevo en el computador.");
    if (pairing.used_at) throw new Error("Ese código ya se usó. Genere uno nuevo en el computador.");
    if (new Date(pairing.expires_at).getTime() < Date.now()) {
      throw new Error("El código venció. Genere uno nuevo en el computador.");
    }

    // Se "gasta" de forma atómica: si dos celulares lo intentan a la vez, solo uno entra.
    const { data: claimed } = await admin
      .from("scanner_pairings")
      .update({ used_at: new Date().toISOString() })
      .eq("id", pairing.id)
      .is("used_at", null)
      .select("id");
    if (!claimed?.length) throw new Error("Ese código ya se usó. Genere uno nuevo en el computador.");

    const { data: session } = await admin
      .from("scanner_sessions")
      .select("id, store_id, owner_id, expires_at, closed_at")
      .eq("id", pairing.session_id)
      .maybeSingle();
    if (!session || session.closed_at || new Date(session.expires_at).getTime() < Date.now()) {
      throw new Error("La conexión del computador ya terminó. Genere un código nuevo.");
    }

    const { count } = await admin
      .from("scanner_devices")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id)
      .is("disconnected_at", null);
    if ((count ?? 0) >= MAX_ACTIVE_DEVICES) {
      throw new Error("Ya hay demasiados celulares conectados. Desconecte alguno e intente de nuevo.");
    }

    const secret = randomBase64Url(32);
    const name = String(data.deviceName ?? "").trim().slice(0, 40) || "Celular";

    const { data: device, error } = await admin
      .from("scanner_devices")
      .insert({
        session_id: session.id,
        store_id: session.store_id,
        owner_id: session.owner_id,
        name,
        secret_hash: await sha256(secret),
      })
      .select("id")
      .single();
    if (error || !device) throw new Error("No se pudo conectar el celular. Intente de nuevo.");

    let storeName = "la tienda";
    if (session.store_id) {
      const { data: store } = await admin.from("stores").select("name").eq("id", session.store_id).maybeSingle();
      if (store?.name) storeName = store.name;
    }

    return { deviceId: device.id, deviceSecret: secret, deviceName: name, storeName };
  });

/** Latido: mantiene "conectado" al celular y le avisa si lo desconectaron o la sesión venció. */
export const pingScannerDevice = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { deviceId: string; deviceSecret: string })
  .handler(async ({ data }) => {
    const { admin, device } = await requireDevice(data.deviceId, data.deviceSecret);
    await admin.from("scanner_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
    return { ok: true, mode: deviceMode(device) };
  });

/** Cambia el modo del celular. Queda guardado en el servidor, que es quien lo hace cumplir. */
export const setScannerDeviceMode = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { deviceId: string; deviceSecret: string; mode: ScannerMode })
  .handler(async ({ data }) => {
    const { admin, device } = await requireDevice(data.deviceId, data.deviceSecret);
    if (data.mode !== "ventas" && data.mode !== "consulta") throw new Error("MODO_INVALIDO");

    const { error } = await admin
      .from("scanner_devices")
      .update({ mode: data.mode, last_seen_at: new Date().toISOString() })
      .eq("id", device.id);
    if (error) {
      // La columna "mode" no existe: falta correr el SQL de los modos.
      throw new Error(/mode|schema cache|column/i.test(error.message) ? "MODOS_NO_ACTIVADOS" : "No se pudo cambiar de modo.");
    }
    return { ok: true, mode: data.mode };
  });

/** El celular se desconecta por su cuenta. */
export const disconnectOwnScanner = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { deviceId: string; deviceSecret: string })
  .handler(async ({ data }) => {
    if (!UUID_RE.test(data.deviceId ?? "")) return { ok: true };
    const admin = await getAdmin();
    const { data: device } = await admin
      .from("scanner_devices")
      .select("id, secret_hash")
      .eq("id", data.deviceId)
      .maybeSingle();
    if (device && safeEqual(await sha256(data.deviceSecret ?? ""), device.secret_hash)) {
      await admin
        .from("scanner_devices")
        .update({ disconnected_at: new Date().toISOString() })
        .eq("id", device.id)
        .is("disconnected_at", null);
    }
    return { ok: true };
  });

/** Un código leído por el celular: se busca el producto y se guarda el evento UNA sola vez. */
export const submitDeviceScan = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { deviceId: string; deviceSecret: string; eventId: string; barcode: string })
  .handler(async ({ data }): Promise<ScanResult> => {
    const { admin, device, session } = await requireDevice(data.deviceId, data.deviceSecret);
    // Un celular en "consulta de precios" NUNCA puede mandar productos al carrito del POS.
    if (deviceMode(device) !== "ventas") throw new Error("MODO_CONSULTA");

    if (!UUID_RE.test(data.eventId ?? "")) throw new Error("EVENTO_INVALIDO");
    const barcode = String(data.barcode ?? "").trim();
    if (!BARCODE_RE.test(barcode)) throw new Error("CODIGO_INVALIDO");

    // Reintento del mismo escaneo (por falla de red): se devuelve lo que ya se guardó.
    const { data: previous } = await admin.from("scan_events").select("*").eq("event_id", data.eventId).maybeSingle();
    if (previous) {
      if (previous.device_id !== device.id) throw new Error("EVENTO_INVALIDO");
      return toResult(previous, await stockOf(admin, previous.product_id), { duplicate: true });
    }

    // Rebote: el mismo código leído otra vez por el mismo celular en menos de 1,5 s.
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
    const { data: recent } = await admin
      .from("scan_events")
      .select("event_id")
      .eq("device_id", device.id)
      .eq("barcode", barcode)
      .gte("created_at", since)
      .limit(1);
    if (recent?.length) return { eventId: data.eventId, found: false, ignored: true, product: null };

    let productQuery = admin
      .from("products")
      .select("id, name, price, image_url, stock")
      .in("barcode", barcodeVariants(barcode))
      .eq("status", "active")
      .limit(1);
    if (session.store_id) productQuery = productQuery.eq("store_id", session.store_id);
    const { data: products } = await productQuery;
    const product = products?.[0] ?? null;

    const row = {
      event_id: data.eventId,
      session_id: session.id,
      device_id: device.id,
      owner_id: session.owner_id,
      barcode,
      found: Boolean(product),
      product_id: product?.id ?? null,
      product_name: product?.name ?? null,
      unit_price: product ? Number(product.price) : null,
      image_url: product?.image_url ?? null,
    };

    const { data: inserted, error } = await admin.from("scan_events").insert(row).select("*").single();
    if (error || !inserted) {
      // Carrera con un reintento idéntico: ya quedó guardado, se devuelve ese.
      if (error?.code === "23505") {
        const { data: again } = await admin.from("scan_events").select("*").eq("event_id", data.eventId).maybeSingle();
        if (again) return toResult(again, Number(product?.stock ?? 0), { duplicate: true });
      }
      throw new Error("No se pudo registrar el escaneo. Intente de nuevo.");
    }

    await admin.from("scanner_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
    return toResult(inserted, Number(product?.stock ?? 0));
  });

/** Categorías para el formulario de producto del celular. */
export const getDeviceCategories = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { deviceId: string; deviceSecret: string })
  .handler(async ({ data }) => {
    const { admin, session } = await requireDevice(data.deviceId, data.deviceSecret);
    let query = admin.from("categories").select("id, name").eq("is_active", true).order("name");
    if (session.store_id) query = query.eq("store_id", session.store_id);
    const { data: categories } = await query;
    return (categories ?? []) as { id: string; name: string }[];
  });

type RegisterProductInput = {
  deviceId: string;
  deviceSecret: string;
  eventId: string;
  barcode: string;
  name: string;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  categoryId: string | null;
  description: string;
  imageUrl: string | null;
  addToSale: boolean;
};

/** Crea un producto nuevo desde el celular (solo si el dueño de la sesión es administrador). */
export const registerDeviceProduct = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as RegisterProductInput)
  .handler(async ({ data }): Promise<ScanResult> => {
    const { admin, device, session } = await requireDevice(data.deviceId, data.deviceSecret);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", session.owner_id);
    const canManage = (roles ?? []).some((r) => r.role === "admin" || r.role === "super_admin");
    if (!canManage) throw new Error("SIN_PERMISO_PRODUCTOS");

    const barcode = String(data.barcode ?? "").trim();
    const name = String(data.name ?? "").trim();
    if (!BARCODE_RE.test(barcode)) throw new Error("CODIGO_INVALIDO");
    if (name.length < 2 || name.length > 120) throw new Error("Escriba el nombre del producto.");

    const price = Number(data.price);
    const cost = Number(data.cost);
    const stock = Number(data.stock);
    const minStock = Number(data.minStock);
    if (!Number.isFinite(price) || price < 0) throw new Error("Revise el precio de venta.");
    if (![cost, stock, minStock].every((n) => Number.isFinite(n) && n >= 0)) {
      throw new Error("Revise el precio de compra y las cantidades.");
    }

    let duplicateQuery = admin.from("products").select("id, name").in("barcode", barcodeVariants(barcode)).limit(1);
    if (session.store_id) duplicateQuery = duplicateQuery.eq("store_id", session.store_id);
    const { data: duplicates } = await duplicateQuery;
    if (duplicates?.length) throw new Error(`CODIGO_DUPLICADO:${duplicates[0]?.name ?? ""}`);

    const { data: product, error } = await admin
      .from("products")
      .insert({
        store_id: session.store_id,
        name,
        barcode,
        category_id: data.categoryId || null,
        description: String(data.description ?? "").trim() || null,
        cost,
        price,
        stock,
        min_stock: minStock,
        image_url: data.imageUrl || null,
        status: "active",
      })
      .select("id, name, price, image_url, stock")
      .single();
    if (error || !product) throw new Error("No se pudo guardar el producto. Intente de nuevo.");

    if (stock > 0) {
      await admin.from("inventory_movements").insert({
        product_id: product.id,
        store_id: session.store_id,
        type: "entrada",
        quantity: stock,
        stock_before: 0,
        stock_after: stock,
        unit_cost: cost,
        reason: "Stock inicial al crear el producto (desde celular)",
        reference_type: "product_creation",
        created_by: session.owner_id,
      });
    }

    const eventId = UUID_RE.test(data.eventId ?? "") ? data.eventId : crypto.randomUUID();
    // En "consulta de precios" el producto se crea pero jamás se manda al carrito.
    const addToSale = Boolean(data.addToSale) && deviceMode(device) === "ventas";
    await admin
      .from("scan_events")
      .insert({
        event_id: eventId,
        session_id: session.id,
        device_id: device.id,
        owner_id: session.owner_id,
        barcode,
        found: true,
        product_id: product.id,
        product_name: product.name,
        unit_price: Number(product.price),
        image_url: product.image_url,
        // Si no se pidió agregarlo a la venta, el evento nace "usado" y el POS lo ignora.
        consumed_at: addToSale ? null : new Date().toISOString(),
      });

    return {
      eventId,
      found: true,
      product: {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        imageUrl: product.image_url,
        stock: Number(product.stock),
      },
    };
  });

/** Sube la foto opcional del producto desde el celular (ya reducida en el navegador). */
export const uploadDeviceProductImage = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Solicitud inválida");
    return data;
  })
  .handler(async ({ data }) => {
    const { admin } = await requireDevice(
      String(data.get("deviceId") ?? ""),
      String(data.get("deviceSecret") ?? ""),
    );

    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("Seleccione una foto.");
    if (!IMAGE_TYPES.includes(file.type)) throw new Error("Formato de foto no permitido.");
    if (file.size > 6 * 1024 * 1024) throw new Error("La foto es muy pesada.");

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage
      .from("product-images")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error("No se pudo subir la foto.");

    return { url: admin.storage.from("product-images").getPublicUrl(path).data.publicUrl };
  });

/**
 * Consulta de precios: SOLO LEE. No crea eventos, no toca el carrito del POS, no genera
 * ventas ni movimientos de inventario y no cambia ninguna existencia.
 */
export const lookupDeviceProduct = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { deviceId: string; deviceSecret: string; barcode: string })
  .handler(async ({ data }): Promise<PriceLookupResult> => {
    const { admin, device, session } = await requireDevice(data.deviceId, data.deviceSecret);
    if (deviceMode(device) !== "consulta") throw new Error("MODO_VENTAS");

    const barcode = String(data.barcode ?? "").trim();
    if (!BARCODE_RE.test(barcode)) throw new Error("CODIGO_INVALIDO");

    let query = admin
      .from("products")
      .select("name, price, stock, min_stock, image_url, categories(name)")
      .in("barcode", barcodeVariants(barcode))
      .eq("status", "active")
      .limit(1);
    if (session.store_id) query = query.eq("store_id", session.store_id);

    const { data: rows } = await query;
    const row = rows?.[0];
    if (!row) return { found: false, product: null };

    const stock = Number(row.stock);
    const minStock = Number(row.min_stock);
    const category = row.categories as { name: string } | null;

    return {
      found: true,
      product: {
        name: row.name,
        price: Number(row.price),
        stock,
        status: stock <= 0 ? "agotado" : stock <= minStock ? "pocas" : "disponible",
        categoryName: category?.name ?? null,
        imageUrl: row.image_url,
      },
    };
  });
