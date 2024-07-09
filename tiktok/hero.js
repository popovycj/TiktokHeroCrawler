const Hero = require('@ulixee/hero');
const ExecuteJsPlugin = require('@ulixee/execute-js-plugin');

async function initHero(proxy = null, startUrl = 'https://www.tiktok.com/search/user?q=ugc') {
  let heroConfig = {
    showChrome: true,
    // connectionToCore: {
    //   host: `https://browser.staging.ghostly.digital/`,
    // },
    userAgent: '~ chrome >= 120 && mac >= 12',
    userProfile: {
      deviceProfile: {
        webGlParameters: {
          37445: 'Google Inc. (Apple)',
          37446: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
        }
      },
    },
   }

  if (proxy) {
    heroConfig = {
      ...heroConfig,
      upstreamProxyUrl: `http://${proxy}`,
      upstreamProxyIpMask: {
        proxyIp: proxy.split(':')[0] // For WebRTC IP masking
      },
      timezoneId: 'America/New_York', // TODO: find a way to get this from the proxy
    }
  }

  console.log('Starting Hero with config:', heroConfig);

  const hero = new Hero(heroConfig);

  hero.use(ExecuteJsPlugin);

  /* ---------------------------------------------------------------------------  */
  /* ----------------------- CAPTCHA BYPASSING PART START ----------------------- */

  let isCaptchaPresent = false;

  hero.activeTab.on('resource', (resource) => {
    if (resource.url.includes('https://verification-va.tiktok.com/captcha') ||
        resource.url.includes('https://verification.tiktokw.us/captcha/')) {
      isCaptchaPresent = true;
    }
  });

  async function checkAndRefresh() {
    await hero.goto(startUrl);
    await hero.waitForPaintingStable();
    await hero.waitForMillis(5000 * 1.5); // TODO: find better way to wait enough time for captcha to load

    if (isCaptchaPresent) {
      console.log("Captcha detected, refreshing page...");
      isCaptchaPresent = false;
      await checkAndRefresh();
    }
  }

  await checkAndRefresh();

  console.log("Captcha resolved, proceeding with the next steps.");
  /* ----------------------- CAPTCHA BYPASSING PART END -----------------------  */
  /* --------------------------------------------------------------------------  */

  console.log('Hero initialized with session ID:', await hero.sessionId);

  return hero;
}


module.exports = { initHero };
