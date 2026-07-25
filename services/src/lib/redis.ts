import Redis from "ioredis";

const url = process.env.REDIS_URL;
if (!url) {
  throw new Error("REDIS_URL is not set");
}

// lazyConnect: defer the TCP connection until the first command, so importing
// this module (e.g. transitively from a route under test) doesn't force a live
// Redis. Routes that never touch Redis in a given test therefore never connect.
export const redis = new Redis(url, { lazyConnect: true });
