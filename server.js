const express = require('express')
const next = require('next')

const getBanStatus = require('./helpers/getBanStatus')

const oneHour = (1000 * 60 * 60)

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  const server = express()
  
  server.get('/check', async function (req, res) {
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    const result = await getBanStatus(ip)
    
    console.log(result)
    
    res.send(result)
  })

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
