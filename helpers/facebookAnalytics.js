const is = require('./is')

module.exports = () => {
  // Cancel if there's no document
  if (typeof document !== 'object') return
  
  const id = 'facebook-jssdk'
  const fbAppId = process.env.FACEBOOK_APP_ID
  
  let js, fjs = document.getElementsByTagName('script')[0]
  if (document.getElementById(id)) return
  js = document.createElement('script')
  js.id = id
  js.src = `//connect.facebook.net/en_US/sdk.js#xfbml=1&version=v2.10&appId=${fbAppId}`
  fjs.parentNode.insertBefore(js, fjs)
}