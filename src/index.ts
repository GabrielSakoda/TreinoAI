import "dotenv/config";

import fastify from "fastify";
const app = fastify({
  logger: true,
});

app.get("/", async function handler() {
  return { hello: "world" };
});

try {
  await app.listen({ port: Number(process.env.PORT) || 8081 });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
