import { Server } from "socket.io";
import { Server as HTTPServer } from "http";
import { env } from "../config/env.config";

let io: Server | null = null;

export const initializeSocket = (server: HTTPServer) => {
  io = new Server(server, {
    cors: {
      origin: env.FRONTEND_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket?.id);
    socket.on("join", (userId: string) => {
      socket.join(`user:${userId}`);
      console.log(`User ${userId} joined their room`);
    });

    socket.on("leave", (userId: string) => {
      socket.leave(`user:${userId}`);
    });
    socket.on("disconnect", () => {
      console.log("user disconnect", socket.id);
      
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};
