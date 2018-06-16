const axios = require('axios')
const is = require('./is')
const cacheable = require('./cacheable')
const getMessage = require('./messages')


const oneHour = (1000 * 60 * 60)

const mapRawSettings = async (rawSettings) => {
  let mapped = {}
  
  rawSettings.map((rawSetting) => {
    const setting = {
      id: rawSetting.gsx$id.$t,
      value: rawSetting.gsx$value.$t
    }
    
    mapped[setting.id] = setting
  })
  
  return mapped
}

const requestSettings = async () => {
  // https://spreadsheets.google.com/feeds/list/12qMxDnJDAACrdYimZzanNeAdOqXD84FFQhLonfeJa04/od6/public/values?alt=json
  const sheetUrl = `https://spreadsheets.google.com/feeds/list/${process.env.SETTINGS_SHEET_KEY}/od6/public/values?alt=json`
  const response = await axios.get(sheetUrl)
    .catch((error) => {
      console.log('Error getting settings sheet', error)
      return
    })
  if (!response) return
  const json = await response.json()
  const rawSettings = json.feed.entry
  const mappedSettings = mapRawSettings(rawSettings)
  
  return mappedSettings
}

module.exports = async () => {
  // Get and cache settings
  const settings = await cacheable('settings', oneHour, async () => requestSettings())
  
  return settings
}