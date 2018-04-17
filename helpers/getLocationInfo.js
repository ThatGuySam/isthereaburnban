require('now-env')
const iplocation = require('iplocation')
const NodeGeocoder = require('node-geocoder')

const geocoderOptions = {
  provider: 'google',

  // Optional depending on the providers
  httpAdapter: 'https', // Default
  apiKey: process.env.GOOGLE_KEY, // for Mapquest, OpenCage, Google Premier
  formatter: null         // 'gpx', 'string', ...
}

// Setup Geocoder instance
const geocoder = NodeGeocoder(geocoderOptions)

const fetchIPInfo = (ip) =>  new Promise(function(resolve, reject) {
  
  const providers = [`http://api.ipstack.com/${ip}?access_key=${process.env.IPSTACK_KEY}`]
  
  iplocation(ip, providers, async function (error, ipres) {

    /* ipres:

      {
        as: 'AS11286 KeyBank National Association',
        city: 'Cleveland',
        country: 'United States',
        countryCode: 'US',
        isp: 'KeyBank National Association',
        lat: 41.4875,
        lon: -81.6724,
        org: 'KeyBank National Association',
        query: '156.77.54.32',
        region: 'OH',
        regionName: 'Ohio',
        status: 'success',
        timezone: 'America/New_York',
        zip: '44115'
      }

    */
    
    if (error) {
      reject(Error("It broke"));
    } else {
      resolve(ipres)
    }

  })
})

module.exports = async (ip) => {
  
  const ipInfo = await fetchIPInfo(ip)
  
  let locationInfo
  
  // Or using Promise
  await geocoder.geocode(ipInfo.city)
    .then(function(res) {
      locationInfo = res
    })
    .catch(function(err) {
      console.log(err)
    })
  
  return locationInfo
}