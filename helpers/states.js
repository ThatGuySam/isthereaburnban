const is = require('is_js')
const cacheable = require('./cacheable')
const getOKBurnBans = require('./getOKBurnBans')
const getTXBurnBans = require('./getTXBurnBans')

const oneHour = (1000 * 60 * 60)

module.exports = (stateCode) => {
  
  const states = {
    'OK': {
      getBans: () => {
        return cacheable('ok-bans', oneHour, async () => await getOKBurnBans())
      },
      source: {
        name: 'Oklahoma Forestry',
        url: 'http://www.forestry.ok.gov/burn-ban-info'
      }
    },
    'TX': {
      getBans: () => {
        return cacheable('texas-bans', oneHour, async () => await getTXBurnBans())
      },
      source: {
        name: 'Texas Forest Service',
        url: 'http://texasforestservice.tamu.edu/TexasBurnBans/'
      }
    }
  }
  
  const supportsState = is.propertyDefined(states, stateCode)
  
  // Return null if there's no state
  if (!supportsState) return null
  
  return states[stateCode]
}