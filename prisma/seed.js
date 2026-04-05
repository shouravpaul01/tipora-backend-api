"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initiateSuperAdmin = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = __importDefault(require("../src/shared/prisma"));
const initiateSuperAdmin = () => __awaiter(void 0, void 0, void 0, function* () {
    const existingAdmin = yield prisma_1.default.user.findFirst({
        where: { role: "ADMIN" },
    });
    if (existingAdmin) {
        console.log("Admin already exists, skipping...");
        return;
    }
    const hashedPassword = yield bcrypt_1.default.hash("admin123", 10);
    yield prisma_1.default.user.create({
        data: {
            firstName: "Super",
            lastName: "Admin",
            fullName: "Super Admin",
            email: "admin@example.com",
            role: "ADMIN",
            auth: {
                create: {
                    password: hashedPassword,
                },
            },
        },
    });
    console.log("Admin seeded successfully");
});
exports.initiateSuperAdmin = initiateSuperAdmin;
