const express = require('express')
const next = require('next')
const bodyParser = require('body-parser')

const getBanStatus = require('./helpers/getBanStatus')

const oneHour = (1000 * 60 * 60)

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  const server = express()
  
  server.use(bodyParser.json()); // support json encoded bodies
  server.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
  
  server.all('/check', async function (req, res) {
    const result = await getBanStatus(req.body.geolocation)
    
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
