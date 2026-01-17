import pino from "pino";

const logger = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss",
      singleLine: true,
      ignore: "pid,hostname",
      levelFirst: true,
      // isso deixa as cores mais claras
    },
  },
});

export { logger };
