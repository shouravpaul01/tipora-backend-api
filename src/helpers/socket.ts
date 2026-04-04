import { Server } from "socket.io";
import { Server as HTTPServer } from "http";
import jwt from "jsonwebtoken";
import { env } from "../config/env.config";
import { jwtHelpers } from "./jwtHelpers";

let io: Server | null = null;

interface DecodedToken {
  id: string;
  email?: string;
}

//  Middleware for socket authentication
const socketAuthMiddleware = (socket: any, next: any) => {
  try {
    const token =
      socket.handshake.auth?.token ||  socket.handshake.query?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("Unauthorized: No token provided"));
    }

    const decoded = jwtHelpers.verifyToken(token, env.JWT_SECRET) as DecodedToken;

    
    socket.user = decoded;

    next();
  } catch (error) {
    next(new Error("Unauthorized: Invalid token"));
  }
};

export const initializeSocket = (server: HTTPServer) => {
  io = new Server(server, {
    cors: {
      origin: env.FRONTEND_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  //  Apply middleware
  io.use(socketAuthMiddleware);

  io.on("connection", (socket:any) => {
    const user = socket.user;

    console.log("User connected:", user.id);

    //  Auto join user room
    socket.join(`user:${user.id}`);

    // Optional manual join
    socket.on("join", () => {
      socket.join(`user:${user.id}`);
    });

    socket.on("leave", () => {
      socket.leave(`user:${user.id}`);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", user.id);
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