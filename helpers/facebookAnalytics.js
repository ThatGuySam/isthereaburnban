export default () => {
  // Cancel if there's no document
  if (typeof document !== 'object') return
  
  window.fbAsyncInit = function() {
    // console.log('Facebook Analytics Initialized')
    const FB = window.FB
    FB.AppEvents.logPageView()
  }
  
  const id = 'facebook-jssdk'
  const fbAppId = process.env.FACEBOOK_APP_ID
  
  let js
  let fjs = document.getElementsByTagName('script')[0]
  if (document.getElementById(id)) return
  js = document.createElement('script')
  js.id = id
  js.src = `//connect.facebook.net/en_US/sdk.js#xfbml=1&version=v2.10&appId=${fbAppId}`
  if (typeof fjs !== 'undefined') fjs.parentNode.insertBefore(js, fjs)
}