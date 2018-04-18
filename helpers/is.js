require('now-env')
const is = require('is_js')

const customIs = {}

// If there's a window there's probably a browser
customIs.browser = () => typeof window !== 'undefined'

// Whatever the opposite of customIs.browser is
customIs.server = () => !customIs.browser

// Is development environment
customIs.dev = () => (process.env.NODE_ENV !== 'production')

// Is production environment
customIs.production = () => !customIs.dev

// Is referrer current site
customIs.refferedLocally = () => (document.referrer.indexOf(location.protocol + '//' + location.host) === 0)

const mergedIs = {
  ...is,
  ...customIs
}

// Merge old and new
module.exports = mergedIs
