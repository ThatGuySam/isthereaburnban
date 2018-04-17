const LRUCache = require('lru-cache')

let cache = new LRUCache({
  max: 10000,
  maxAge: 1000 * 60 * 60 * 24 // 1 day
})

module.exports = async (key, maxAge, fetcher) => {
  
  // If we have it in the cache, let's serve it
  if (cache.has(key)) {
    console.log('Got cached', key)
    return cache.get(key)
  }
  
  console.log('Fetched fresh', key)
  const result = fetcher()
  
  await cache.set(key, result, maxAge)
  
  return result
}