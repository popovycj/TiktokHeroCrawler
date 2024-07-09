const { initHero } = require("./tiktok/hero");
const { searchUsersByKeyword, getUserInfo } = require("./tiktok/crawler");
const { getRandomProxy } = require("./tiktok/utils");

const express = require("express");
const app = express();
app.use(express.json());

const MAX_SESSIONS = 7;

let sessionPool = [];
let requestQueue = [];

// ---- SYNC INITIALISATION ----
// async function initHeroSessions() {
//   for (let i = 0; i < MAX_SESSIONS; i++) {
//     const hero = await initHero();
//     console.log(`Session ${await hero.sessionId} initialized.`);
//     sessionPool.push(hero);
//   }
// }

// ---- CONCURRENT INITIALISATION ----
async function initHeroSessions() {
  const promises = [];
  for (let i = 0; i < MAX_SESSIONS; i++) {
    proxy = getRandomProxy();
    promises.push(initHero(proxy));
  }

  const results = await Promise.allSettled(promises);

  results.forEach((result) => {
    if (result.status === "fulfilled") {
      sessionPool.push(result.value);
    } else {
      console.error(`Session failed to initialize:`, result.reason);
    }
  });
}

function acquireSession() {
  return new Promise((resolve) => {
    if (sessionPool.length > 0) {
      resolve(sessionPool.pop());
    } else {
      requestQueue.push(resolve);
    }
  });
}

function releaseSession(hero) {
  if (requestQueue.length > 0) {
    const resolve = requestQueue.shift();
    resolve(hero);
  } else {
    sessionPool.push(hero);
  }
}

function clearSessions() {
  // TODO: close all sessions
  // sessionPool.forEach(async hero => await hero.close());
  // sessionPool = [];
  // for (const resolve of requestQueue) {
  //   resolve(null);
  // }
}

app.get("/search/:keyword", async (req, res) => {
  const { keyword } = req.params;
  const { cursor, searchId } = req.query;

  const hero = await acquireSession();
  try {
    const result = await searchUsersByKeyword(hero, keyword, cursor, searchId);
    res.json(result);
  } catch (error) {
    console.error("Error during search:", error);
    res.status(500).json({ error: "Failed to process search request" });
  } finally {
    releaseSession(hero);
  }
});

app.get("/user/:username", async (req, res) => {
  const { username } = req.params;

  const hero = await acquireSession();
  try {
    const userInfo = await getUserInfo(hero, username);
    res.json(userInfo);
  } catch (error) {
    console.error("Error fetching user info:", error);
    res.status(500).json({ error: "Failed to retrieve user information" });
  } finally {
    releaseSession(hero);
  }
});

// TODO: refresh sessions after some period of time

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initHeroSessions();
});

// process.on("SIGINT", clearSessions);
// process.on("SIGTERM", clearSessions);
