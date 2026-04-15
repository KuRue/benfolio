import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_NAME = "gallery_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  sub: string;
  exp: number;
};

function base64Url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", env.AUTH_COOKIE_SECRET)
    .update(payload)
    .digest("base64url");
}

function encodeSession(payload: SessionPayload) {
  const encodedPayload = base64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function decodeSession(token: string) {
  const [payloadSegment, signature] = token.split(".");

  if (!payloadSegment || !signature) {
    return null;
  }

  const expectedSignature = sign(payloadSegment);

  if (expectedSignature.length !== signature.length) {
    return null;
  }

  const valid = timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature),
  );

  if (!valid) {
    return null;
  }

  const payload = JSON.parse(
    Buffer.from(payloadSegment, "base64url").toString("utf8"),
  ) as SessionPayload;

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, storedHash] = passwordHash.split(":");

  if (algorithm !== "scrypt" || !salt || !storedHash) {
    return false;
  }

  const derivedHash = scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(storedHash, "hex");

  return timingSafeEqual(derivedHash, storedBuffer);
}

export async function createAdminSession(adminUserId: string) {
  const cookieStore = await cookies();
  const token = encodeSession({
    sub: adminUserId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = decodeSession(token);

  if (!session) {
    return null;
  }

  return prisma.adminUser.findUnique({
    where: {
      id: session.sub,
    },
  });
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    redirect("/admin/login");
  }

  return admin;
}

export async function hasAdminUsers() {
  const count = await prisma.adminUser.count();
  return count > 0;
}
