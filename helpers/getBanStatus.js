const is = require('./is')
const states = require('./states')
const getLocationInfo = require('./getLocationInfo')
const getMessage = require('./messages')

module.exports = async (geolocation) => {
  
  const location = await getLocationInfo(geolocation)
  
  const locationName = `${location.city}, ${location.administrativeLevels.level1short}`
  const stateName = location.administrativeLevels.level1long
  const stateCode = location.administrativeLevels.level1short
  const googleCountyName = location.administrativeLevels.level2long || null
  const countyName = (googleCountyName) ? googleCountyName.toLowerCase().replace("county", "").trim() : null

  const state = states(stateCode)
  
  // Check if state is supported
  if (state === null) return {
    key: 'stateNotSupported',
    ...getMessage('stateNotSupported', {name: locationName})
  }
  
  const bans = await state.getBans()
  
  // Check if has a county
  if (countyName === null) return {
    key: 'noCounty',
    button: {
      label: state.source.name,
      url: state.source.url
    },
    ...getMessage('noCounty', {name: locationName}),
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