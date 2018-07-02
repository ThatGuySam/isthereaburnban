const is = require('is_js')

module.exports = (key) => {
  
  const geolocations = {
    'brokenarrow': {
      coords: {
        accuracy: 5,
        altitude: 0,
        altitudeAccuracy: -1,
        heading: -1,
        latitude: 36.7299286,
        longitude: -102.517822,
        speed: -1
      },
      timestamp: 1528944033344.24
    },
    'boisecity': {
      coords: {
        accuracy: 5,
        altitude: 0,
        altitudeAccuracy: -1,
        heading: -1,
        latitude: 36.7297121,
        longitude: -102.5130764,
        speed: -1
      },
      timestamp: 1528944033344.24
    },
    // Texas
    'elpaso': {
      coords: {
        accuracy: 5,
        altitude: 0,
        altitudeAccuracy: -1,
        heading: -1,
        latitude: 31.7688106,
        longitude: -106.4436692,
        speed: -1
      },
      timestamp: 1528944033344.24
    },
    'canadian': {
      coords: {
        accuracy: 5,
        altitude: 0,
        altitudeAccuracy: -1,
        heading: -1,
        latitude: 35.7297121,
        longitude: -100.5130764,
        speed: -1
      },
      timestamp: 1528944033344.24
    }
  }
  
  const hasLocation = is.propertyDefined(geolocations, key)
  
  // Return null if there's no state
  if (!hasLocation) {
    console.log('That location is not defined', key)
    return null
  }
  
  return geolocations[key]
}