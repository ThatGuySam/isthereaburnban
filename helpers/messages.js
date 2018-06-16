module.exports = (key, location = null) => {
  const place = (location) ? location.name : ''
  
  const messages = [
    {
      key: 'ready',
      word: '',
      message: '',
      backgroundColor: '#123646'
    },
    {
      key: 'checking',
      word: 'Checking',
      message: 'It will be revealed with fire, and the fire will test the quality of each person’s work.',
      backgroundColor: '#9a9a9a'
    },
    {
      key: 'yes',
      word: 'Yes',
      message: `There is a ban in effect for ${place}`,
      backgroundColor: '#f34f49'
    },
    {
      key: 'no',
      word: 'Nope',
      message: `There is no burn ban active for ${place}`,
      backgroundColor: '#35c28c'
    },
    {
      key: 'stateNotSupported',
      word: 'Oops',
      message: `Sorry we don't support your state yet`,
      backgroundColor: '#323232'
    },
    {
      key: 'error',
      word: 'Uh-oh',
      message: 'There was problem checking. ',
      backgroundColor: '#323232'
    }
  ]
  
  return messages.filter(function( set ) {
    return set.key === key
  })[0]
}