/** Evita que una petición colgada deje la pantalla esperando para siempre. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = "La conexión tardó demasiado. Intente de nuevo.",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
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
