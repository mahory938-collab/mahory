let audioContext: AudioContext | null = null;

/** Pitido corto: agudo cuando todo salió bien, grave cuando algo falló. Silencioso si el navegador no deja sonar. */
export function playBeep(kind: "ok" | "error" = "ok") {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioContext ??= new Ctor();
    if (audioContext.state === "suspended") void audioContext.resume();

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = kind === "ok" ? "sine" : "square";
    oscillator.frequency.value = kind === "ok" ? 1040 : 200;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "ok" ? 0.14 : 0.32));
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + (kind === "ok" ? 0.15 : 0.34));
  } catch {
    // sin sonido
  }
}
