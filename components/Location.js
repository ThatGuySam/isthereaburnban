import React, { Component } from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import Cookies from 'universal-cookie'
import axios from 'axios'
import { addCount, setBanStatus } from '../store'
import is from '../helpers/is'
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
  
  onLocated = (positionInstance) => {
    // Convert Position stance to object so it can object things
    // like get sent via axios
    const geolocation = {
      timestamp: positionInstance.timestamp,
      coords: {
        accuracy: positionInstance.coords.accuracy,
        altitude: positionInstance.coords.altitude,
        altitudeAccuracy: positionInstance.coords.altitudeAccuracy,
        heading: positionInstance.coords.heading,
        latitude: positionInstance.coords.latitude,
        longitude: positionInstance.coords.longitude,
        speed: positionInstance.coords.speed
      }
    }
    // Record that we've got location permission
    // so we don't ask every time
    this.setLocationPermission(true)
    // Get the status
    this.getBanStatus(geolocation)
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
    
    navigator.geolocation.getCurrentPosition(this.onLocated, (error) => {
      this.setLocationPermission(false)
      console.log('Geolocation error', error)
    })
  }
  
  getBanStatus = async (geolocation) => {
    const status = await axios.post('/check', {
      geolocation: geolocation
    }).then( response => {
      return response.data
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