require('now-env')
const fetch = require('isomorphic-unfetch')

const fetchBans = (ip) => new Promise(function(resolve, reject) {
  
  if (error) {
    reject(Error("It broke"));
  } else {
    resolve(ipres)
  }
  
})

module.exports = async (ip) => {
  
  const response = await fetch(process.env.OK_DATA_URL)
  
  const json = await response.json()
  
  let mapped = []
  
  json.features.map((ban) => {
    // console.log(ban)
    const county = {
      id: ban.attributes.OBJECTID,
      name: ban.attributes.county_nam,
      status: ban.attributes.Burn_Ban_Status,
      inEffect: (ban.attributes.Burn_Ban_Status !== 'None')
    }
    
    mapped.push(county)
  })
  
  return mapped
}