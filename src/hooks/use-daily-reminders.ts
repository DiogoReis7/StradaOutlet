/** Pede permissão de notificações do browser (uma vez, após interação). */
export function pedirPermissaoNotificacoes() {
  if (typeof window === "undefined" || !("Notification" in window)) return Promise.resolve("denied" as const);
  if (Notification.permission !== "default") return Promise.resolve(Notification.permission);
  return Notification.requestPermission();
}
