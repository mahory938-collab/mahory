import { createServerFn } from "@tanstack/react-start";

const BUCKET = "product-images";
const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

async function ensureBucket(admin: Awaited<ReturnType<typeof getAdmin>>) {
  const { data: buckets } = await admin.storage.listBuckets();
  const bucketConfig = {
    public: true,
    fileSizeLimit: MAX_SIZE_BYTES,
    allowedMimeTypes: ALLOWED_TYPES,
  };

  if (buckets?.some((bucket) => bucket.name === BUCKET)) {
    // Bucket already existed (possibly created with an older, smaller limit) — keep it in sync.
    await admin.storage.updateBucket(BUCKET, bucketConfig);
    return;
  }

  await admin.storage.createBucket(BUCKET, bucketConfig);
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Uploads a product image via the service-role client (bypasses RLS) and returns its public URL. */
export const uploadProductImage = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Solicitud inválida");
    return data;
  })
  .handler(async ({ data }) => {
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("Seleccione una imagen");
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error("Formato no permitido. Use PNG, JPG, WEBP o GIF.");
    }
    if (file.size > MAX_SIZE_BYTES) throw new Error("La imagen no debe superar 20MB");

    const admin = await getAdmin();
    await ensureBucket(admin);

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl };
  });
