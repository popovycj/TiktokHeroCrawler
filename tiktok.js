const Hero = require('@ulixee/hero-playground');
const ExecuteJsPlugin = require('@ulixee/execute-js-plugin');


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


async function searchUsersByKeyword(hero, keyword) {
  /* ----------------CAPTCHA PART START ---------------- */
  let isCaptchaPresent = false;

  hero.activeTab.on('resource', (resource) => {
    if (resource.url.includes('https://verification-va.tiktok.com/captcha') ||
        resource.url.includes('https://verification.tiktokw.us/captcha/')) {
      isCaptchaPresent = true;
    }
  });

  async function checkAndRefresh() {
    await hero.goto(`https://www.tiktok.com/search/user?q=${keyword}`);
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
  /* ----------------CAPTCHA PART END ---------------- */


  let userCounter = 0;
  let usernames = [];

  const userAgent      = await hero.executeJs(() => navigator.userAgent);
  const language       = await hero.executeJs(() => navigator.language || navigator.userLanguage);
  const secChUaHeaders = await generateSecChUaHeaders(hero);
  const cookieString   = await getSessionCookieString(hero);

  const searchRequestHeaders = {
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': language,
    'Cookie': cookieString,
    'Referer': `https://www.tiktok.com/search/user?q=${keyword}`,
    ...secChUaHeaders,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': userAgent,
  };

  const defaultParams = await generateSessionParams(hero);

  let cursor = 0;
  let hasMore = true;
  let searchId = null;

  while (hasMore) {
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

    const result = JSON.parse(await hero.executeJs(makeRequestCallback, signedUrl, 'GET', searchRequestHeaders));

    console.log(result);

    if (result.user_list) {
      console.log(`Found +${result.user_list.length} users.`);
      userCounter += result.user_list.length;
      usernames = usernames.concat(result.user_list.map(user => user.user_info.unique_id));
    };

    if (result.has_more) {
      cursor = result.cursor;
      // searchId = result.rid;
      // Sleep for 5 seconds before making the next request
      await hero.waitForMillis(5000);
    } else {
      hasMore = false;
    }
  }

  console.log(`Total users found: ${userCounter}`);

  console.log(usernames);

  for (const [index, username] of usernames.entries()) {
    console.log(`Processing User ${index + 1}: ${username}...`);

    const cookieString = await getSessionCookieString(hero);

    const userRequestHeaders = {
      'Accept': 'text/html,application/xhtml+xml,application/xml',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': language,
      'Cookie': cookieString,
      'Referer': `https://www.tiktok.com/`,
      ...secChUaHeaders,
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent': userAgent,
    };

    const url = `https://www.tiktok.com/@${username}`;

    const resultHtml = await hero.executeJs(makeRequestCallback, url, 'GET', userRequestHeaders);

    const resultJson = await hero.executeJs((html) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const scriptTag = doc.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (scriptTag) {
        return JSON.parse(scriptTag.textContent);
      }
      return null;
    }, resultHtml);

    await hero.waitForMillis(500);

    if (resultJson) {
      console.log('User info fetched successfully for', username, resultJson);
    } else {
      console.log('Failed to fetch user info for', username);
    }
  };
}


(async () => {
  const proxyIp = "3.219.185.98"

  const hero = new Hero({
    showChrome: false,
    userAgent: '~ chrome >= 120 && mac >= 12',
    upstreamProxyUrl: `http://${proxyIp}:8888`,
    upstreamProxyIpMask: {
      proxyIp: proxyIp // For WebRTC IP masking
    },
    timezoneId: 'America/New_York',
    userProfile: {
      deviceProfile: {
        webGlParameters: {
          37445: 'Google Inc. (Apple)',
          37446: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
        }
      },
    },
  });

  hero.use(ExecuteJsPlugin);

  await searchUsersByKeyword(hero, 'ugc');

  await hero.close();
})();
