require("dotenv").config();

function getRandomProxy() {
  const proxies = [];
  Object.keys(process.env).forEach((key) => {
    if (key.startsWith("PROXY_")) {
      proxies.push(process.env[key]);
    }
  });

  if (proxies.length === 0) {
    throw new Error("No proxies configured in the environment");
  }

  const randomIndex = Math.floor(Math.random() * proxies.length);
  return proxies[randomIndex];
}

module.exports = { getRandomProxy };
