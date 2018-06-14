const is = require('./is')
const cacheable = require('./cacheable')
const getOKBurnBans = require('./getOKBurnBans')
const getLocationInfo = require('./getLocationInfo')
const getMessage = require('./messages')

const oneHour = (1000 * 60 * 60)

module.exports = async (geolocation) => {
  
  const bans = await cacheable('ok-bans', oneHour, async () => await getOKBurnBans())
  
  let locationName
  let state
  let googleCountyName
  let countyName
  
  if (is.propertyDefined(geolocation, 'address')) {
    locationName = `${geolocation.address.city}, ${geolocation.address.stateCode}`
    state = geolocation.address.state
    googleCountyName = geolocation.address.region
    countyName = googleCountyName.toLowerCase().replace("county", "").trim()
  } else {
    const location = await getLocationInfo(geolocation)
    
    locationName = `${location.city}, ${location.administrativeLevels.level1short}`
    state = location.administrativeLevels.level1long
    googleCountyName = location.administrativeLevels.level2long
    countyName = googleCountyName.toLowerCase().replace("county", "").trim()
  }
  
  
  if (state !== 'Oklahoma') return {
    key: 'stateNotSupported',
    ...getMessage('stateNotSupported', {name: locationName})
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