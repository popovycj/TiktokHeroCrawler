const Hero = require('@ulixee/hero-playground');
const ExecuteJsPlugin = require('@ulixee/execute-js-plugin');
const fs = require('fs');


async function generateXBogus(hero, url) {
  const xBogus = await hero.executeJs((url) => {
    if (window.byted_acrawler !== undefined) {
      return window.byted_acrawler.frontierSign(url);
    }
    return null;
  }, url);

  if (!xBogus) {
    await hero.waitForMillis(500);
    return await generateXBogus(hero, url);
  }

  return xBogus['X-Bogus'];
}

function signUrl(url, xBogus) {
  return `${url}${url.includes("?") ? '&' : '?'}X-Bogus=${xBogus}`;
}

async function generateSecChUaHeaders(hero) {
  const userAgentData = await hero.executeJs(() => navigator.userAgentData.toJSON());

  const secChUa = userAgentData.brands.map(brand => `"${brand.brand}";v="${brand.version}"`).join(', ');
  const secChUaMobile = userAgentData.mobile ? '?1' : '?0';
  const secChUaPlatform = `"${userAgentData.platform}"`;

  return {
    'sec-ch-ua': secChUa,
    'sec-ch-ua-mobile': secChUaMobile,
    'sec-ch-ua-platform': secChUaPlatform,
  };
}

async function generateSessionParams(hero) {
  const [userAgent, platform, language, timezone] = await hero.executeJs(() => [
    navigator.userAgent,
    navigator.platform,
    navigator.language || navigator.userLanguage,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ]);

  const deviceId     = Math.floor(Math.random() * (10**19 - 10**18) + 10**18).toString();
  const historyLen   = Math.floor(Math.random() * 10 + 1).toString();
  const screenHeight = Math.floor(Math.random() * (1080 - 600) + 600).toString();
  const screenWidth  = Math.floor(Math.random() * (1920 - 800) + 800).toString();

  const msToken = (await hero.activeTab.cookieStorage.getItem('msToken'))?.value;

  if (!msToken) {
      throw new Error('msToken cookie is missing');
  }

  return {
    "aid": "1988",
    "app_language": language,
    "app_name": "tiktok_web",
    "browser_language": language,
    "browser_name": "Mozilla",
    "browser_online": "true",
    "browser_platform": platform,
    "browser_version": userAgent,
    "channel": "tiktok_web",
    "cookie_enabled": "true",
    "device_id": deviceId,
    "device_platform": "web_pc",
    "focus_state": "true",
    "from_page": "search",
    "history_len": historyLen,
    "is_fullscreen": "false",
    "is_page_visible": "true",
    "language": language,
    "os": platform,
    "referrer": "https://www.tiktok.com/",
    "priority_region": "",
    "region": "US",
    "screen_height": screenHeight,
    "screen_width": screenWidth,
    "tz_name": timezone,
    "webcast_language": language,
    "msToken": msToken,
  };
}

async function getSessionCookieString(hero) {
  const cookies = await hero.activeTab.cookieStorage.getItems();
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

async function makeRequestCallback(url, method, headers) {
  return fetch(url, { method: method, headers: headers }).then(response => response.text());
}

async function prepareDefaultRequestHeaders(hero) {
  const userAgent      = await hero.executeJs(() => navigator.userAgent);
  const language       = await hero.executeJs(() => navigator.language || navigator.userLanguage);
  const secChUaHeaders = await generateSecChUaHeaders(hero);
  const cookieString   = await getSessionCookieString(hero);

  return {
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': language,
    'Cookie': cookieString,
    'Referer': 'https://www.tiktok.com/',
    ...secChUaHeaders,
    'User-Agent': userAgent,
  };
}

async function initHero(profilePath = null, proxyIp = null, startUrl = 'https://www.tiktok.com/search/user?q=ugc') {
  let profile = null;

  if (profilePath) {
    const rawProfileJson = fs.readFileSync(profilePath, 'utf-8');
    profile = JSON.parse(rawProfileJson);
  }

  let heroConfig = { showChrome: true }

  if (profile) {
    heroConfig.userProfile = profile;
  } else {
    heroConfig = {
      ...heroConfig,
      userProfile: {
        deviceProfile: {
          webGlParameters: {
            37445: 'Google Inc. (Apple)',
            37446: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
          }
        },
      },
    }
  }

  if (proxyIp) {
    heroConfig = {
      ...heroConfig,
      upstreamProxyUrl: `http://${proxyIp}:8888`,
      upstreamProxyIpMask: {
        proxyIp: proxyIp // For WebRTC IP masking
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

  return hero;
}

async function searchUsersByKeyword(hero, keyword, cursor = 0, searchId = null) {
  const headers = {
    ...await prepareDefaultRequestHeaders(hero),
    'Accept': '*/*',
    'Referer': `https://www.tiktok.com/search/user?q=${keyword}`,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  const defaultParams = await generateSessionParams(hero);
  const params = {
    ...defaultParams,
    ...(searchId && { search_id: searchId }),
    "cursor": cursor,
    "keyword": keyword,
    "referer": `https://www.tiktok.com/search/user?q=${keyword}`,
    'web_search_code': '{"tiktok":{"client_params_x":{"search_engine":{"ies_mt_user_live_video_card_use_libra":1,"mt_search_general_user_live_card":1}},"search_server":{}}}'
  };

  const encodedParams = new URLSearchParams(params).toString();
  const url = `https://www.tiktok.com/api/search/user/full/?${encodedParams}`;

  const xBogus = await generateXBogus(hero, url);
  const signedUrl = signUrl(url, xBogus);

  const result = JSON.parse(await hero.executeJs(makeRequestCallback, signedUrl, 'GET', headers));

  return result;
}

async function getUserInfo(hero, username) {
  const headers = {
    ...await prepareDefaultRequestHeaders(hero),
    'Accept': 'text/html,application/xhtml+xml,application/xml',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };

  const url = `https://www.tiktok.com/@${username}`;

  const resultHtml = await hero.executeJs(makeRequestCallback, url, 'GET', headers);

  const resultJson = await hero.executeJs((html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const scriptTag = doc.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__');
    if (scriptTag) {
      return JSON.parse(scriptTag.textContent);
    }
    return null;
  }, resultHtml);

  return resultJson;
}


(async () => {
  // const proxyIp = "3.219.185.98";
  // const profilePath = "profile.json";

  // const hero = await initHero(profilePath, proxyIp);
  const hero = await initHero();

  const KEYWORD = 'ugc';

  let cursor = 0;
  let hasMore = true;
  let searchId = null;

  let usernames = [];
  let userCounter = 0;

  while (hasMore) {
    const result = await searchUsersByKeyword(hero, KEYWORD, cursor, searchId)

    console.log(result);

    if (result.user_list) {
      console.log(`Found +${result.user_list.length} users.`);
      userCounter += result.user_list.length;
      usernames = usernames.concat(result.user_list.map(user => user.user_info.unique_id));
    };

    if (result.has_more) {
      cursor = result.cursor;
      searchId = result.rid;
      // Sleep for 5 seconds before making the next request
      await hero.waitForMillis(5000);
    } else {
      hasMore = false;
    }
  }

  console.log(`Total users found: ${userCounter}`);
  console.log('Usernames:', usernames);

  for (const [index, username] of usernames.entries()) {
    console.log(`Processing User ${index + 1}: ${username}...`);

    const result = await getUserInfo(hero, username);

    if (result) {
      console.log('User info fetched successfully for', username, result['__DEFAULT_SCOPE__']['webapp.user-detail'].userInfo);
    } else {
      console.log('Failed to fetch user info for', username);
    };

    await hero.waitForMillis(500);
  };


  await hero.close();
})();
