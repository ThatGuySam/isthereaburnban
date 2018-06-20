import React, { Component } from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { addCount, setBanStatus } from '../store'
import Cookies from 'universal-cookie'
import is from '../helpers/is'
import geolocator from '../helpers/geolocator'
import getMessage from '../helpers/messages'

class Location extends Component {
  
  // static async getInitialProps (ctx) {
  //   return {}
  // }
  
  static defaultProps = {
    style: {}
  }

  constructor (props) {
    super(props)
    
    this.cookies = new Cookies()

    this.state = {
      hasLocationPermission: this.cookies.get('hasLocationPermission'),
    }
  }
  
  componentDidMount = async () => {
    if (this.state.hasLocationPermission) this.locate()
  }
  
  setLocationPermission = (canUseLocation) => {
    this.cookies.set('hasLocationPermission', canUseLocation)
    this.setState({
      hasLocationPermission: canUseLocation,
    })
  }
  
  onLocated = (err, location) => {
    if (err) {
      this.setLocationPermission(false)
      return console.log(err)
    }
    
    this.setLocationPermission(true)
    
    // console.log('location', location)
    
    this.getBanStatus(location)
  }
  
  locate = () => {
    
    const checkingStatus = getMessage('checking')
    this.props.setBanStatus(checkingStatus)
    
    const options = {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumWait: 10000,     // max wait time for desired accuracy
        maximumAge: 0,          // disable cache
        desiredAccuracy: 30,    // meters
        fallbackToIP: true,     // fallback to IP if Geolocation fails or rejected
        addressLookup: true,    // requires Google API key if true
        timezone: true,         // requires Google API key if true
        staticMap: true         // get a static map image URL (boolean or options object)
    }
    
    geolocator.locate(options, this.onLocated)
  }
  
  getBanStatus = async (geolocation) => {
    const status = await fetch('/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ geolocation: geolocation })
    }).then( r => {
      // console.log()
      // open(r.headers.get('location'));
      return r.json();
    })
    
    this.props.setBanStatus(status)
  }
  

  render = () => {
    const banStatus = this.props.banStatus
    return (
      <div>
          { (banStatus.key === 'ready') && 
            <div className='btn btn-light' onClick={this.locate}>Check for Burn Ban</div>
          }
      </div>
    )
  }
}

const mapStateToProps = ({ banStatus }) => ({ banStatus })

const mapDispatchToProps = (dispatch) => {
  return {
    addCount: bindActionCreators(addCount, dispatch),
    setBanStatus: bindActionCreators(setBanStatus, dispatch),
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Location)