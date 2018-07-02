import React, { Component } from 'react'
import { bindActionCreators } from 'redux'
import withRedux from 'next-redux-wrapper'
import { initStore, startClock, addCount, setBanStatus } from '../store'
import initFBAnalytics from '../helpers/facebookAnalytics'
import IsThereABurnBan from '../components/IsThereABurnBan'
// checking - #9a9a9a
// success - #8bc34a

class Index extends Component {
  componentDidMount() {
    initFBAnalytics()
  }
  
  static getInitialProps ({ isServer }) {
    // store.dispatch(serverRenderClock(isServer))
    // store.dispatch(addCount())

    return { isServer }
  }

  render () {
    return (
      <IsThereABurnBan />
    )
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    addCount: bindActionCreators(addCount, dispatch),
    startClock: bindActionCreators(startClock, dispatch),
    setBanStatus: bindActionCreators(setBanStatus, dispatch)
  }
}

export default withRedux(initStore, null, mapDispatchToProps)(Index)