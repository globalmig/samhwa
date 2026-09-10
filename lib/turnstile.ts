declare global {
  interface Window {
    turnstile?: { reset: (widgetId?: string) => void };
  }
}

export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const workerUrl = process.env.NEXT_PUBLIC_TURNSTILE_WORKER_URL;
  if (!workerUrl || !token) return false;
  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
