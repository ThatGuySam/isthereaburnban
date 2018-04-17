const express = require('express')
const next = require('next')

const getLocationInfo = require('./helpers/getLocationInfo')
const getOKBurnBans = require('./helpers/getOKBurnBans')
const cacheable = require('./helpers/cacheable')

const oneHour = (1000 * 60 * 60)

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  const server = express()
  
  server.get('/check', async function (req, res) {
    
    const bans = await cacheable('ok-bans', oneHour, async () => await getOKBurnBans())
    
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    // Broken Arrow - '72.213.157.196'
    // Catoosa - '98.184.172.52'
    // Cleveland, OH - '156.77.54.32'
    if (dev) ip = '72.213.157.196'
    
    const locationInfo = await getLocationInfo(ip)
    
    // const bans = await cacheable('ok-bans', oneHour, async () => {
    //   const fetchBans = await getOKBurnBans()
    //   return fetchBans
    // })
    
    const googleCountyName = locationInfo[0].administrativeLevels.level2long
    const countyName = googleCountyName.toLowerCase().replace("county", "").trim()
    
    const foundCounty = bans.filter(function( county ) {
      return county.name.toLowerCase() == countyName
    })[0]
    
    const county = {
      ...foundCounty,
      longName: googleCountyName
    }
    
    res.send({
      ip: ip,
      place: locationInfo[0].formattedAddress,
      county: county
    })
  })

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
