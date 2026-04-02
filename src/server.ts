import { createServer } from "http";
import app from "./app";

import { initializeSocket } from "./helpers/socket";
import redis from "./shared/redis";
import { env } from "./config/env.config";
const httpServer = createServer(app);
initializeSocket(httpServer);
// Main function to start the server
async function main() {
  await redis.ping();
  const server = httpServer.listen(Number(env.PORT), () => {
    console.log(
      "Server is running on port ==>",
      `http://localhost:${env?.PORT}`,
    );

    // initializeCronJobs();
  });

  // Graceful shutdown function
  const exitHandler = () => {
    if (server) {
      server.close(() => {
        console.log("Server closed");
      });
    }
    process.exit(1);
  };

  // Handle uncaught exceptions and unhandled promise rejections
  process.on("uncaughtException", exitHandler);
  process.on("unhandledRejection", exitHandler);
}

// Start the server
main();

export default app;
