import { env } from "./env";

export const googleDriveConfig = {
  enabled: !!(env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN),
  clientId: env.GOOGLE_DRIVE_CLIENT_ID,
  clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
  refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN,
};
