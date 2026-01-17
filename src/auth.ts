import { useMultiFileAuthState } from "baileys";
import path from "path";

export const { state, saveCreds } = await useMultiFileAuthState(
  path.join(process.cwd(), "auth"),
);
