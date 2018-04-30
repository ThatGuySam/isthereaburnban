const webpack = require('webpack')
const withCSS = require('@zeit/next-css')
/**
 * After the next require you can use process.env to get your secrets
 */
require('now-env')

/**
 * If some of the envs are public, like a google maps key, but you still
 * want to keep them secret from the repo, the following code will allow you
 * to share some variables with the client, configured at compile time.
 */
 
const config = config => {
  config.plugins.push(
    new webpack.DefinePlugin({
      // Shared with front-end
      'process.env.APP_NAME': JSON.stringify(process.env.APP_NAME),
      'process.env.APP_DESCRIPTION': JSON.stringify(process.env.APP_DESCRIPTION),
      'process.env.GOOGLE_KEY': JSON.stringify(process.env.GOOGLE_KEY),
      'process.env.FACEBOOK_APP_ID': JSON.stringify(process.env.FACEBOOK_APP_ID)
    })
    // Same as above
    // new webpack.EnvironmentPlugin(['SECRET'])
  )
  return config
}
 
module.exports = withCSS({
  cssModules: true,
  webpack: config
})
