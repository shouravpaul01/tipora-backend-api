import cron from "node-cron";

// this function should call from app.ts
export function initializeCronJobs() {
  console.log(
    "✅ Cron jobs initialized successfully (test mode: every 2 minutes)"
  );

  // ⏰ Run every 20 second (for testing)
  cron.schedule("*/20 * * * * *", async () => {
    console.log("🧩 Test job running");
  });
}
