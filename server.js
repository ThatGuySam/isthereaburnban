const express = require('express')
const next = require('next')

const getLocationInfo = require('./helpers/getLocationInfo')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  const server = express()
  
  server.get('/check', async function (req, res) {
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    // Broken Arrow - '72.213.157.196'
    // Catoosa - '98.184.172.52'
    if (dev) ip = '72.213.157.196'
    
    const locationInfo = await getLocationInfo(ip)
    
    const googleCountyName = locationInfo[0].administrativeLevels.level2long
    const county = googleCountyName.toLowerCase().replace("county", "")
    
    console.log(county)
    
    res.send(county)
  })

  server.get('/a', (req, res) => {
    return app.render(req, res, '/b', req.query)
  })

  server.get('/b', (req, res) => {
    return app.render(req, res, '/a', req.query)
  })

  server.get('/posts/:id', (req, res) => {
    return app.render(req, res, '/posts', { id: req.params.id })
  })

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
