const is = require('./is')
const cacheable = require('./cacheable')
const getOKBurnBans = require('./getOKBurnBans')
const getLocationInfo = require('./getLocationInfo')

const oneHour = (1000 * 60 * 60)

module.exports = async (ip) => {
  
  const bans = await cacheable('ok-bans', oneHour, async () => await getOKBurnBans())
  
  // Broken Arrow - '72.213.157.196'
  // Catoosa - '98.184.172.52'
  // Cleveland, OH - '156.77.54.32'
  if (is.dev()) ip = '156.77.54.32'
  
  const locationInfo = await getLocationInfo(ip)
  const state = locationInfo[0].administrativeLevels.level1long
  
  if (state !== 'Oklahoma') return {
    error: 'stateNotSupported',
    message: `Sorry we don't support your state yet`
  }
  
  const googleCountyName = locationInfo[0].administrativeLevels.level2long
  const countyName = googleCountyName.toLowerCase().replace("county", "").trim()
  
  const foundCounty = bans.filter(function( county ) {
    return county.name.toLowerCase() == countyName
  })[0]
  
  const county = {
    ...foundCounty,
    longName: googleCountyName
  }
  
  return {
    ip: ip,
    place: locationInfo[0].formattedAddress,
    county: county
  }
}