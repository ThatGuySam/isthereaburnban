import getBanStatus from './getBanStatus'
import mockGeolocations from './mockGeolocations'

describe('Check Bans', () => {

  it('Can Check El Paso', async () => {
    const geolocation = mockGeolocations('elpaso')
    const burnBans = await getBanStatus(geolocation)

    expect(burnBans).toMatchSnapshot({
      'backgroundColor': expect.any(String),
      'button': expect.any(Object),
      'key': expect.any(String),
      // 'location': expect.any(Object),
      'message': expect.any(String),
      'word': expect.any(String)
    })
  })
  
  it('Can Check Broken Arrow', async () => {
    const geolocation = mockGeolocations('boisecity')
    const burnBans = await getBanStatus(geolocation)

    expect(burnBans).toMatchSnapshot({
      'backgroundColor': expect.any(String),
      'button': expect.any(Object),
      'key': expect.any(String),
      // 'location': expect.any(Object),
      'message': expect.any(String),
      'word': expect.any(String)
    })
  })

})