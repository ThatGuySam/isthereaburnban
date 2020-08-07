const getBanStatus = require('../helpers/getBanStatus')

export default async function (req, res) {
    const banStatus = await getBanStatus(req.body.geolocation)
    
    res.send(banStatus)
}