module.exports = (req, res, next) => {
  // if the request host doesn't have www
  if (req.hostname !== 'isthereaburnban.com') {
    // redirect to mycompany.com keeping the pathname and querystring
    return res.redirect('https://www.isthereaburnban.com')
  }
  return next() // call the next middleware (or route)
}