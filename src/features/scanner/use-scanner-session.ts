import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ScanEventRow = Database["public"]["Tables"]["scan_events"]["Row"];
export type ScannerDeviceRow = Database["public"]["Tables"]["scanner_devices"]["Row"];

/** Un escaneo más viejo que esto (p. ej. de cuando el computador estaba cerrado) se descarta. */
const STALE_EVENT_MS = 2 * 60 * 1000;
/** Un celular sin latido en este tiempo se muestra como "sin conexión". */
export const DEVICE_ONLINE_MS = 60 * 1000;

export const scannerKeys = {
  session: (userId: string | null) => ["scanner", "session", userId] as const,
  devices: (sessionId: string | null) => ["scanner", "devices", sessionId] as const,
};

export function isDeviceOnline(device: ScannerDeviceRow) {
  return Date.now() - new Date(device.last_seen_at).getTime() < DEVICE_ONLINE_MS;
}

/**
 * Lado del computador (POS): conoce la sesión de escaneo del usuario, los celulares
 * conectados y recibe cada escaneo en tiempo real (Supabase Realtime). Cada escaneo se
 * "reclama" en la base antes de usarse, así que aunque haya dos pestañas abiertas o
 * llegue dos veces, entra al carrito una sola vez.
 */
export function useScannerSession(
  userId: string | null,
  onScan: (event: ScanEventRow, deviceName: string) => void,
) {
  const queryClient = useQueryClient();
  const onScanRef = useRef(onScan);
  const deviceNames = useRef(new Map<string, string>());
  const handled = useRef(new Set<string>());

  useEffect(() => {
    onScanRef.current = onScan;
  });

  const sessionQuery = useQuery({
    queryKey: scannerKeys.session(userId),
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scanner_sessions")
        .select("id, expires_at")
        .eq("owner_id", userId as string)
        .is("closed_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const sessionId = sessionQuery.data?.id ?? null;

  const devicesQuery = useQuery({
    queryKey: scannerKeys.devices(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scanner_devices")
        .select("*")
        .eq("session_id", sessionId as string)
        .is("disconnected_at", null)
        .order("paired_at");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    deviceNames.current = new Map((devicesQuery.data ?? []).map((d) => [d.id, d.name]));
  }, [devicesQuery.data]);

  useEffect(() => {
    if (!sessionId) return;

    const claimAndHandle = async (row: ScanEventRow) => {
      if (handled.current.has(row.event_id)) return;
      handled.current.add(row.event_id);

      const { data: claimed } = await supabase
        .from("scan_events")
        .update({ consumed_at: new Date().toISOString() })
        .eq("event_id", row.event_id)
        .is("consumed_at", null)
        .select("event_id");
      if (!claimed?.length) return; // otra pestaña ya lo tomó

      if (Date.now() - new Date(row.created_at).getTime() > STALE_EVENT_MS) return;
      onScanRef.current(row, deviceNames.current.get(row.device_id) ?? "Celular");
    };

    const catchUp = async () => {
      const { data } = await supabase
        .from("scan_events")
        .select("*")
        .eq("session_id", sessionId)
        .is("consumed_at", null)
        .order("created_at");
      for (const row of data ?? []) await claimAndHandle(row);
    };

    let fastPoll: ReturnType<typeof setInterval> | null = null;
    const startFastPoll = () => {
      fastPoll ??= setInterval(() => void catchUp(), 3000);
    };
    const stopFastPoll = () => {
      if (fastPoll) clearInterval(fastPoll);
      fastPoll = null;
    };

    const channel = supabase
      .channel(`scanner:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scan_events", filter: `session_id=eq.${sessionId}` },
        (payload) => void claimAndHandle(payload.new as ScanEventRow),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scanner_devices", filter: `session_id=eq.${sessionId}` },
        () => void queryClient.invalidateQueries({ queryKey: scannerKeys.devices(sessionId) }),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          stopFastPoll();
          void catchUp();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          startFastPoll();
        }
      });

    // Respaldo: si el tiempo real no está disponible, igual se revisa cada pocos segundos.
    const safetyNet = setInterval(() => void catchUp(), 6000);

    return () => {
      stopFastPoll();
      clearInterval(safetyNet);
      void supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient]);

  const devices = devicesQuery.data ?? [];
  return {
    sessionId,
    devices,
    activeCount: devices.filter(isDeviceOnline).length,
    refreshSession: () => queryClient.invalidateQueries({ queryKey: scannerKeys.session(userId) }),
    refreshDevices: () => queryClient.invalidateQueries({ queryKey: scannerKeys.devices(sessionId) }),
  };
}
