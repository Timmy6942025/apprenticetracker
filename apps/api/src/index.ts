import { buildServer } from "./server.js";
import { config } from "./config.js";

const app = buildServer();

app
  .listen({ host: config.host, port: config.port })
  .then(() => {
    app.log.info(`API running on http://${config.host}:${config.port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
