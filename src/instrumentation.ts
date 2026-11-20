// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPushDispatcherWorker } = await import("@/lib/web-push");
    startPushDispatcherWorker();
  }
}
