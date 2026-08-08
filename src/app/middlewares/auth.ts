import { NextFunction, Request, Response } from "express";
import { Secret } from "jsonwebtoken";
import httpStatus from "http-status";

import ApiError from "../../errors/ApiErrors";
import { jwtHelpers } from "../../helpers/jwtHelpers";
import prisma from "../../shared/prisma";
import { env } from "../../config/env.config";

interface AuthOptions {
  optional?: boolean;
}

type AuthArgument = string | AuthOptions;

const auth = (...args: AuthArgument[]) => {
  // Extract options
  const options: AuthOptions =
    typeof args[args.length - 1] === "object"
      ? (args.pop() as AuthOptions)
      : {};

  // Remaining arguments are roles
  const roles = args as string[];

  return async (
    req: Request & { user?: any },
    res: Response,
    next: NextFunction
  ) => {
    try {
      const token = req.headers.authorization;

      // ─────────────────────────────────────────────
      // 1. No token
      // ─────────────────────────────────────────────

      if (!token) {
        // Optional auth → continue as guest
        if (options.optional) {
          return next();
        }

        // Required auth → reject
        throw new ApiError(
          httpStatus.UNAUTHORIZED,
          "You are not authorized!"
        );
      }

      // ─────────────────────────────────────────────
      // 2. Verify JWT
      // ─────────────────────────────────────────────

      const verifiedUser = jwtHelpers.verifyToken(
        token,
        env.JWT_SECRET as Secret
      );

      // ─────────────────────────────────────────────
      // 3. Check user exists
      // ─────────────────────────────────────────────

      const user = await prisma.user.findUnique({
        where: {
          id: verifiedUser.id,
        },
      });

      if (!user) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          "This user is not found!"
        );
      }

      // ─────────────────────────────────────────────
      // 4. Check user status
      // ─────────────────────────────────────────────

      if (user.status === "BLOCKED") {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          "This user is blocked!"
        );
      }

      // ─────────────────────────────────────────────
      // 5. Check roles
      // ─────────────────────────────────────────────

      if (
        roles.length > 0 &&
        !roles.includes(verifiedUser.role)
      ) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          `Forbidden! Your role ${verifiedUser.role.toLowerCase()} is not allowed to access this route!`
        );
      }

      // ─────────────────────────────────────────────
      // 6. Attach user
      // ─────────────────────────────────────────────

      req.user = verifiedUser;

      // ─────────────────────────────────────────────
      // 7. Continue
      // ─────────────────────────────────────────────

      next();
    } catch (err) {
      next(err);
    }
  };
};

export default auth;