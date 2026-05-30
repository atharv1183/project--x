type ToastPayload = {
  title: string;
  description?: string;
};

export function toast({ title, description }: ToastPayload) {
  if (typeof window === "undefined") return;

  const message = description ? `${title}\n${description}` : title;
  window.setTimeout(() => {
    window.alert(message);
  }, 0);
}
