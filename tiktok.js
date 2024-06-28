const Hero = require('@ulixee/hero-playground');
const ExecuteJsPlugin = require('@ulixee/execute-js-plugin');

async function searchUsersByKeyword(keyword) {
  const proxyIp = "3.219.185.98"

  const hero = new Hero({
    showChrome: true,
    userAgent: '~ chrome >= 120 && mac >= 12',
    // upstreamProxyUrl: `http://${proxyIp}:8888`,
    // upstreamProxyIpMask: {
    //   proxyIp: proxyIp // For WebRTC IP masking
    // },
    // timezoneId: 'America/New_York',
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

  let isCaptchaPresent = false;

  hero.activeTab.on('resource', (resource) => {
    if (resource.url.includes('https://verification-va.tiktok.com/captcha')) {
      isCaptchaPresent = true;
    }
  });

  async function checkAndRefresh() {
    await hero.goto(`https://www.tiktok.com/search/user?q=${keyword}`);
    await hero.waitForPaintingStable();
    await hero.waitForMillis(5000 * 5); // TODO: find better way to wait enough time for captcha to load

    if (isCaptchaPresent) {
      console.log("Captcha detected, refreshing page...");
      isCaptchaPresent = false; // Reset flag for next iteration
      await checkAndRefresh(); // Recursively check and refresh if captcha is still present
    }
  }

  await checkAndRefresh();

  console.log("Captcha resolved, proceeding with the next steps.");

  const useragent = await hero.executeJs(() => navigator.userAgent);
  const language = await hero.executeJs(() => navigator.language || navigator.userLanguage);
  const platform = await hero.executeJs(() => navigator.platform);
  const deviceId = Math.floor(Math.random() * (10**19 - 10**18) + 10**18).toString();  // Random deviceId
  const historyLen = Math.floor(Math.random() * 10 + 1).toString();  // Random history length
  const screenHeight = Math.floor(Math.random() * (1080 - 600) + 600).toString();  // Random screen height
  const screenWidth = Math.floor(Math.random() * (1920 - 800) + 800).toString();  // Random screen width
  const timezone = await hero.executeJs(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Function to generate X-Bogus header
  async function generateXBogus(hero, url) {
    let xBogus = null;
    while (!xBogus) {
      xBogus = await hero.executeJs((url) => {
        if (window.byted_acrawler !== undefined) {
          return window.byted_acrawler.frontierSign(url);
        }
        return null;
      }, url);
      if (!xBogus) {
        await hero.waitForMillis(500);
      }
    }
    return xBogus;
  }

  // Function to sign the URL with X-Bogus header
  async function signUrl(hero, url) {
    const xBogusObj = await generateXBogus(hero, url);
    const xBogus = xBogusObj ? xBogusObj['X-Bogus'] : null;
    if (!xBogus) {
      throw new Error("Failed to generate X-Bogus");
    }
    if (url.includes("?")) {
      url += `&X-Bogus=${xBogus}`;
    } else {
      url += `?X-Bogus=${xBogus}`;
    }
    return url;
  }

  // Function to generate Sec-Ch-Ua headers
  function generateSecChUaHeaders(userAgentData) {
    const secChUa = userAgentData.brands.map(brand => `"${brand.brand}";v="${brand.version}"`).join(', ');
    const secChUaMobile = userAgentData.mobile ? '?1' : '?0';
    const secChUaPlatform = `"${userAgentData.platform}"`;

    return {
      'sec-ch-ua': secChUa,
      'sec-ch-ua-mobile': secChUaMobile,
      'sec-ch-ua-platform': secChUaPlatform,
    };
  }

  const userAgentDataString = await hero.executeJs(() => {
    const userAgentData = navigator.userAgentData;
    return JSON.stringify(userAgentData);
  });

  const userAgentData = JSON.parse(userAgentDataString);

  let cursor = 0;
  let hasMore = true;
  let searchId = null;

  let userCounter = 0;

  while (hasMore) {
    // Get cookies
    const cookiesList = await hero.activeTab.cookieStorage.getItems();
    const cookieString = cookiesList.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    const msToken = cookiesList.find(cookie => cookie.name === 'msToken')?.value || '';

    const params = {
      "aid": "1988",
      "app_language": language,
      "app_name": "tiktok_web",
      "browser_language": language,
      "browser_name": "Mozilla",
      "browser_online": "true",
      "browser_platform": platform,
      "browser_version": useragent,
      "channel": "tiktok_web",
      "cookie_enabled": "true",
      "device_id": deviceId,
      "device_platform": "web_pc",
      "focus_state": "true",
      "from_page": "search",
      "cursor": cursor,
      "history_len": historyLen,
      "is_fullscreen": "false",
      "is_page_visible": "true",
      "language": language,
      "os": platform,
      "priority_region": "",
      "referer": "",
      "region": "US",
      "screen_height": screenHeight,
      "screen_width": screenWidth,
      "tz_name": timezone,
      "webcast_language": language,
      "msToken": msToken,
      "keyword": keyword,
      'web_search_code': '{"tiktok":{"client_params_x":{"search_engine":{"ies_mt_user_live_video_card_use_libra":1,"mt_search_general_user_live_card":1}},"search_server":{}}}'
    };

    if (searchId) {
      params['search_id'] = searchId;
    }

    const encoded_params = new URLSearchParams(params).toString();
    const url = `https://www.tiktok.com/api/search/user/full/?${encoded_params}`;

    const signedUrl = await signUrl(hero, url);
    const secChUaHeaders = generateSecChUaHeaders(userAgentData);

    const requestHeaders = {
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': language,
      'Cookie': cookieString,
      'Referer': 'https://www.tiktok.com/search/user?q=ugc',
      ...secChUaHeaders,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': useragent,
    };

    // Execute fetch request in the browser context
    const result = await hero.executeJs(async (signedUrl, requestHeaders) => {
      return fetch(signedUrl, {
        method: 'GET',
        headers: requestHeaders
      }).then(response => response.json());
    }, signedUrl, requestHeaders);

    console.log(result);

    if (result.user_list) {
      console.log(`Found +${result.user_list.length} users.`);
      userCounter += result.user_list.length;
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

  await hero.close();
}

(async () => {
  await searchUsersByKeyword('ugc');
})();
