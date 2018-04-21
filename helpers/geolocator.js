import geolocator from 'geolocator'

geolocator.config({
    language: "en",
    google: {
        version: "3",
        key: process.env.GOOGLE_KEY
    }
})

geolocator.setGeoIPSource({
    provider: 'ipstack',
    // https requires premium api key
    url: `http://api.ipstack.com/check?access_key=${process.env.IPSTACK_KEY}`, // ADD YOUR ACCESS KEY
    callbackParam: 'callback',
    schema: {
        ip: 'ip',
        coords: {
            latitude: 'latitude',
            longitude: 'longitude'
        },
        address: {
            city: 'city',
            state: 'region_name',
            stateCode: 'region_code',
            postalCode: 'zip',
            countryCode: 'country_code',
            country: 'country_name',
            region: 'region_name'
        }
    }
})

export default geolocator