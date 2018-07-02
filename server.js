const express = require('express')
const next = require('next')
const bodyParser = require('body-parser')

// Setup file deps
const is = require('./helpers/is')
const redirectNakedToWww = require('./helpers/redirectNakedToWww')
const getIpInfo = require('./helpers/getIpInfo')
const getBanStatus = require('./helpers/getBanStatus')
const createSitemap = require('./helpers/createSitemap')

// Setup variables
const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'

// Setup Instances
const app = next({ dev })
const handle = app.getRequestHandler()
const sitemap = createSitemap()

app.prepare()
.then(() => {
  const server = express()
  
  server.use(redirectNakedToWww) // Redirect naken domain to www.
  server.use(bodyParser.json()) // support json encoded bodies
  server.use(bodyParser.urlencoded({ extended: true })) // support encoded bodies
  
  server.all('/check', async function (req, res) {
    const banStatus = await getBanStatus(req.body.geolocation)
    
    res.send(banStatus)
  })
  
  server.get('/getip', async function (req, res) {
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    
    // Broken Arrow - '72.213.157.196'
    // Catoosa - '98.184.172.52'
    // Cleveland, OH - '156.77.54.32'
    if (is.dev()) ip = '98.184.172.52'
    
    const ipInfo = await getIpInfo(ip)
    
    res.setHeader('Content-Type', 'application/json')
    // Set callback name
    if (typeof req.query.callback !== 'undefined') {
      server.set(req.query.callback, 'cb')
      res.jsonp(ipInfo)
    } else {
      res.send(ipInfo)
    }
  })
  
  server.get('/sitemap.xml', function(req, res) {
    sitemap.toXML( function (err, xml) {
        if (err) {
          return res.status(500).end()
        }
        res.header('Content-Type', 'application/xml')
        res.send( xml )
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
