const fetch = require('isomorphic-unfetch')
const is = require('./is')
const cacheable = require('./cacheable')
const getMessage = require('./messages')

const oneHour = (1000 * 60 * 60)

module.exports = async (ip) => {
  
  const requestUrl = `http://api.ipstack.com/${ip}?access_key=${process.env.IPSTACK_KEY}`
  
  const ipInfo = await cacheable(`ip-${ip}-info`, (oneHour * 24 * 30), async () => {
    return await fetch(requestUrl).then(r => r.json())
  })
  
  return ipInfo
}