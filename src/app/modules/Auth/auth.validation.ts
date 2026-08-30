import { z } from "zod";

const register = z.object({
  body: z.object({
    firstName: z.string().trim().nonempty("First name is required."),
    lastName: z.string().trim().nonempty("Last name is required."),
    email: z.string().email("Please enter a valid email address."),
    password: z.string().min(6, "Password must be at least 6 characters."),
    phone: z.string().nonempty("Phone number is required"),
  }),
});

const verifyOtp = z.object({
  body: z.object({
    email: z.string().email("Please enter a valid email address."),
    otp: z.string().length(6, "OTP must be 6 digits."),
    fcmToken: z.string().nonempty("FCM token is required.").optional()
  }),
});

const login = z.object({
  body: z.object({
     phone: z.string().nonempty("Phone number is required"),
    password: z.string().nonempty("Password is required."),
    fcmToken: z.string().nonempty("FCM token is required.").optional()
  }),
});

const forgotPassword = z.object({
  body: z.object({
    email: z.string().email("Please enter a valid email address."),
  }),
});

const verifyResetOtp = z.object({
  body: z.object({
    email: z.string().email("Please enter a valid email address."),
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
 const changePassword= z.object({
    body: z.object({
      currentPassword: z.string().nonempty("Current password is required."),
      newPassword: z.string().nonempty("New password is required.").min(6, "Password must be at least 6 characters."),
    }),
  })
export const AuthValidations = {
  register,
  verifyOtp,
  login,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  refreshToken,
  changePassword
};
