import bcrypt from "bcrypt";
import prisma from "../shared/prisma";

export const initiateSuperAdmin = async () => {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (existingAdmin) {
    console.log("Admin already exists, skipping...");
    return;
  }

  const hashedPassword = await bcrypt.hash("admin123", 10);

  await prisma.user.create({
    data: {
      firstName: "Super",
      lastName: "Admin",
      fullName: "Super Admin",
      email: "admin@example.com",
      phone: "+8801863272200",
      role: "ADMIN",
      isPhoneVerified:true,
      auth: {
        create: {
          password: hashedPassword,
        },
      },
    },
  });

  console.log("Admin seeded successfully");
};
