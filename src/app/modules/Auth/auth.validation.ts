import { z } from "zod";

const register = z.object({
  body: z.object({
    name: z.string().trim().nonempty("Name is required."),
    email: z.string().nonempty("Email is required.").email("Valid email is required."),
    password: z.string().min(6, "Password must be at least 6 characters."),
    phone: z.string().optional(),
  }),
});

const verifyOtp = z.object({
  body: z.object({
    email: z.string().email("Valid email is required."),
    otp: z.string().length(6, "OTP must be 6 digits."),
  }),
});

const login = z.object({
  body: z.object({
    email: z.string().email("Valid email is required."),
    password: z.string().nonempty("Password is required."),
  }),
});

const forgotPassword = z.object({
  body: z.object({
    email: z.string().email("Valid email is required."),
  }),
});

const verifyResetOtp = z.object({
  body: z.object({
    email: z.string().email("Valid email is required."),
    otp: z.string().length(6, "OTP must be 6 digits."),
  }),
});

const resetPassword = z.object({
  body: z.object({
    resetToken: z.string().nonempty("Reset token is required."),
    newPassword: z.string().min(6, "Password must be at least 6 characters."),
  }),
});

const refreshToken = z.object({
  cookies: z.object({
    refreshToken: z.string().nonempty("Refresh token is required."),
  }),
});

export const AuthValidations = {
  register,
  verifyOtp,
  login,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  refreshToken,
};