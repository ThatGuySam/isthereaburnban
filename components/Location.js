import React, { Component } from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import Cookies from 'universal-cookie'
import axios from 'axios'
import { addCount, setBanStatus } from '../store'
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
    const { hasLocationPermission } = this.state
    if (hasLocationPermission) this.locate()
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
  
  setLocationPermission = (canUseLocation) => {
    this.cookies.set('hasLocationPermission', canUseLocation)
    this.setState({
      hasLocationPermission: canUseLocation,
    })
  }
  
  getBanStatus = async (geolocation) => {
    const { setBanStatus } = this.props
    const status = await axios.post('/check', {
      geolocation: geolocation
    }).then( response => {
      return response.data
    })
    
    setBanStatus(status)
  }
  
  locate = () => {
    const { setBanStatus } = this.props
    const checkingStatus = getMessage('checking')
    setBanStatus(checkingStatus)
    
    navigator.geolocation.getCurrentPosition(this.onLocated, (error) => {
      this.setLocationPermission(false)
      console.log('Geolocation error', error)
    })
  }
  

  render = () => {
    const { banStatus } = this.props
    return (
      <div>
        { (banStatus.key === 'ready') && (
        <button className='btn btn-light' type='button' onClick={this.locate}>
Check for Burn Ban
        </button>
)}
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