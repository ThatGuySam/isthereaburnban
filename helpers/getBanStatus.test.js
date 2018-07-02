import getBanStatus from './getBanStatus'
import mockGeolocations from './mockGeolocations'

describe('Check Bans', () => {
  
  const burnBanStructure = {
    'backgroundColor': expect.any(String),
    'key': expect.any(String),
    'message': expect.any(String),
    'word': expect.any(String)
  }

  it('Can Check El Paso', async () => {
    const geolocation = mockGeolocations('elpaso')
    const burnBans = await getBanStatus(geolocation)
  
    expect(burnBans).toMatchObject(burnBanStructure)
  })
  
  it('Can Check Boise City', async () => {
    const geolocation = mockGeolocations('boisecity')
    const burnBans = await getBanStatus(geolocation)
  
    expect(burnBans).toMatchObject(burnBanStructure)
  })
  
  it('Can Check Broken Arrow', async () => {
    const geolocation = mockGeolocations('brokenarrow')
    const burnBans = await getBanStatus(geolocation)
  
    expect(burnBans).toMatchObject(burnBanStructure)
  })
  
  it('Can Handle Missing County', async () => {
    const geolocation = mockGeolocations('canadian')
    const burnBans = await getBanStatus(geolocation)
    const burnBanWithNoCounty = {
      ...burnBanStructure,
      'key': 'noCounty'
    }
  
    expect(burnBans).toMatchObject(burnBanWithNoCounty)
  })

})