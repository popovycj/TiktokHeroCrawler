const { initHero } = require('./tiktok/hero');
const { searchUsersByKeyword, getUserInfo } = require('./tiktok/crawler');


// SCRAPE ALL USERS WITH KEYWORD 'ugc' AND FETCH USER INFO
(async () => {
  // const proxyIp = "3.219.185.98";

  // const hero = await initHero(proxyIp);
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
