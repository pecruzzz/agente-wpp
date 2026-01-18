import { Command } from "./types.js";
import oi from "./oi.js";
import ifoodCommands from "./ifoodCommands.js";
import eustaquio from "./gpt.js";

export const commands: Command[] = [oi, ifoodCommands, eustaquio];
