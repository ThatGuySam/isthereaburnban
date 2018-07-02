const sitemap = require('sitemap')

module.exports = () => {
  return sitemap.createSitemap({
    hostname: process.env.APP_URL,
    cacheTime: 600000,        // 600 sec - cache purge period
    urls: [
      { url: '/',  changefreq: 'daily', priority: 1 }
    ]
  })
}