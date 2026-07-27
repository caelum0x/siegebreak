import { buildApp } from "./app";
import { runMatchTick } from "./modules/matchmaking/matcher";
import { startMatchNotifier } from "./modules/matchmaking/notifier";

const app = buildApp();

// Subscribe this instance to match-found events so it can push them to its own
// connected sockets (see modules/matchmaking/notifier). Started at boot; the
// publish side runs from the matcher tick below.
startMatchNotifier((err) => app.log.error(err, "match notifier error"));

// Naive in-process matcher tick — fine for one API instance. Move this to
// a single-leader worker before running more than one instance, so two
// processes don't both try to match the same queued players.
setInterval(() => {
  runMatchTick().catch((err) => app.log.error(err));
}, 1000);

app
  .listen({ port: Number(process.env.PORT) || 8080, host: "0.0.0.0" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
