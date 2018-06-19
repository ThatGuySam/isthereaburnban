const is = require('./is')
const states = require('./states')
const getLocationInfo = require('./getLocationInfo')
const getMessage = require('./messages')

module.exports = async (geolocation) => {
  
  let locationName
  let stateName
  let googleCountyName
  let countyName
  
  if (is.propertyDefined(geolocation, 'address')) {
    locationName = `${geolocation.address.city}, ${geolocation.address.stateCode}`
    stateName = geolocation.address.state
    stateCode = geolocation.address.stateCode
    googleCountyName = geolocation.address.region
    countyName = googleCountyName.toLowerCase().replace("county", "").trim()
  } else {
    const location = await getLocationInfo(geolocation)
    
    locationName = `${location.city}, ${location.administrativeLevels.level1short}`
    stateName = location.administrativeLevels.level1long
    stateCode = location.administrativeLevels.level1short
    googleCountyName = location.administrativeLevels.level2long
    countyName = googleCountyName.toLowerCase().replace("county", "").trim()
  }

  const state = states(stateCode)
  
  // Check if state is supported
  if (state === null) return {
    key: 'stateNotSupported',
    ...getMessage('stateNotSupported', {name: locationName})
  }
  
  const bans = await state.getBans()
  
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