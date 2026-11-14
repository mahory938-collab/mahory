const KEY = "mahory-scanner-device";

export type StoredDevice = {
  deviceId: string;
  deviceSecret: string;
  deviceName: string;
  storeName: string;
};

export function loadDevice(): StoredDevice | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDevice>;
    if (parsed.deviceId && parsed.deviceSecret) {
      return {
        deviceId: parsed.deviceId,
        deviceSecret: parsed.deviceSecret,
        deviceName: parsed.deviceName ?? "Celular",
        storeName: parsed.storeName ?? "la tienda",
      };
    }
  } catch {
    // almacenamiento no disponible
  }
  return null;
}

export function saveDevice(device: StoredDevice) {
  try {
    localStorage.setItem(KEY, JSON.stringify(device));
  } catch {
    // almacenamiento no disponible
  }
}

export function clearDevice() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // almacenamiento no disponible
  }
}
