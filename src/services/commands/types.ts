import { WASocket } from "baileys";
import { FormattedMessage } from "../../services/handlers/msgParser.js";

export interface Command {
  command: string;
  execute: (bot: WASocket, message: FormattedMessage) => Promise<void>;
}
