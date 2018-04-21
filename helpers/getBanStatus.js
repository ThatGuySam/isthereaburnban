const is = require('./is')
const cacheable = require('./cacheable')
const getOKBurnBans = require('./getOKBurnBans')
const getLocationInfo = require('./getLocationInfo')
const getMessage = require('./messages')

const oneHour = (1000 * 60 * 60)

module.exports = async (geolocation) => {
  
  const bans = await cacheable('ok-bans', oneHour, async () => await getOKBurnBans())
  
  // Broken Arrow - '72.213.157.196'
  // Catoosa - '98.184.172.52'
  // Cleveland, OH - '156.77.54.32'
  // if (is.dev()) ip = '98.184.172.52'
  
  // console.log('geolocation', geolocation)
  // console.log('geolocation.address', geolocation.address)
  
  // const locationInfo = await getLocationInfo(ip)
  const locationName = `${geolocation.address.city}, ${geolocation.address.stateCode}`
  const state = geolocation.address.state
  const googleCountyName = geolocation.address.region
  const countyName = googleCountyName.toLowerCase().replace("county", "").trim()
  
  if (state !== 'Oklahoma') return {
    key: 'stateNotSupported',
    status: getMessage('stateNotSupported', {name: locationName})
  }
  
  const county = bans.filter(function( county ) {
    return county.name.toLowerCase() == countyName
  })[0]
  
  const key = (county.inEffect) ? 'yes' : 'no'
  const locationResponse = {
    name: locationName,
    county: {
      ...county,
      longName: googleCountyName
    }
  }
  
  const status = getMessage(key, locationResponse)
  
  return {
    key: key,
    location: locationResponse,
    ...status
  }
}