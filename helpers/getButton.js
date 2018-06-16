const is = require('./is')
const getSettings = require('./getSettings')

module.exports = async () => {
  // Get and cache settings
  const settings = await getSettings()
  const hasSettings = (!!settings)
  const hasButtonLabel = is.propertyDefined(settings, 'buttonLabel')
  const hasButtonUrl = is.propertyDefined(settings, 'buttonUrl')
  
  if (!hasSettings || !hasButtonLabel || !hasButtonUrl) return null
  
  return {
    label: settings.buttonLabel.value,
    url: settings.buttonUrl.value
  }
}