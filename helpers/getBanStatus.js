const is = require('./is')
const cacheable = require('./cacheable')
const getOKBurnBans = require('./getOKBurnBans')
const getLocationInfo = require('./getLocationInfo')
const getMessage = require('./messages')

const oneHour = (1000 * 60 * 60)

module.exports = async (ip) => {
  
  const bans = await cacheable('ok-bans', oneHour, async () => await getOKBurnBans())
  
  // Broken Arrow - '72.213.157.196'
  // Catoosa - '98.184.172.52'
  // Cleveland, OH - '156.77.54.32'
  if (is.dev()) ip = '156.77.54.32'
  
  const locationInfo = await getLocationInfo(ip)
  const locationName = locationInfo[0].formattedAddress
  const state = locationInfo[0].administrativeLevels.level1long
  const googleCountyName = locationInfo[0].administrativeLevels.level2long
  const countyName = googleCountyName.toLowerCase().replace("county", "").trim()
  
  if (state !== 'Oklahoma') return {
    key: 'stateNotSupported',
    status: getMessage('stateNotSupported', {name: locationName})
  }
  
  const county = bans.filter(function( county ) {
    return county.name.toLowerCase() == countyName
  })[0]
  
  const key = (county.inEffect) ? 'yes' : 'no'
  const location = {
    ip: ip,
    name: locationName,
    county: {
      ...county,
      longName: googleCountyName
    }
  }
  
  console.log(getMessage('yes', {name: locationName}))
  
  return {
    key: key,
    status: getMessage(key, location),
    location: location
  }
}