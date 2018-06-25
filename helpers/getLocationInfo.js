require('now-env')
const NodeGeocoder = require('node-geocoder')

const cacheable = require('./cacheable')

const oneDayCacheTime = (24 * 60 * 60 * 1000)

const geocoderOptions = {
  provider: 'google',

  // Optional depending on the providers
  httpAdapter: 'https', // Default
  apiKey: process.env.GOOGLE_KEY, // for Mapquest, OpenCage, Google Premier
  formatter: null         // 'gpx', 'string', ...
}

// Setup Geocoder instance
const geocoder = NodeGeocoder(geocoderOptions)

module.exports = async (geolocation) => {
  
  const latitude = (+geolocation.coords.latitude).toFixed(3)
  const longitude = (+geolocation.coords.longitude).toFixed(3)
  const cacheKey = `geocode-${latitude},${longitude}`
    
  const locationInfo = await cacheable(cacheKey, oneDayCacheTime, async () => {
    return await geocoder.reverse({lat:latitude, lon:longitude})
      .then(function(res) {
        return res[0]
      })
      .catch(function(err) {
        console.log(`Error geocoding ${cacheKey}`, err)
      })
  })
  
  return locationInfo
}