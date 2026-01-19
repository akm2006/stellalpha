import { getIronSession, SessionOptions, IronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  nonce?: string;
  isLoggedIn: boolean;
  user?: {
    id: string;
    wallet: string;
  };
}

export const sessionOptions: SessionOptions = {
  password: process.env.IRON_SESSION_PASSWORD as string,
  cookieName: "stellalpha_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
