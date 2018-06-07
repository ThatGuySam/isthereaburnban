const is = require('./is')
const getSettings = require('./getSettings')

module.exports = async () => {
  // Get and cache settings
  const settings = await getSettings()
  const hasButtonLabel = is.propertyDefined(settings, 'buttonLabel')
  const hasButtonUrl = is.propertyDefined(settings, 'buttonUrl')
  
  if (!hasButtonLabel || !hasButtonUrl) return {}
  
  return {
    label: settings.buttonLabel.value,
    url: settings.buttonUrl.value
  }
}