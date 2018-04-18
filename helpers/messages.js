module.exports = (key, location) => {
  const place = location.name
  
  const messages = {
    'yes': {
      word: 'Yes',
      message: `There is a ban in effect for ${place}`,
      backgroundColor: '#f34f49'
    },
    'no': {
      word: 'Nope',
      message: `There is no burn ban active for ${place}`,
      backgroundColor: '#35c28c'
    },
    'stateNotSupported': {
      word: 'Oops',
      message: `Sorry we don't support your state yet`,
      backgroundColor: '#323232'
    }
  }
  
  return messages[key]
}