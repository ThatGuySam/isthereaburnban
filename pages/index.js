import React, { Component } from 'react'
import { bindActionCreators } from 'redux'
import { connect } from 'react-redux'
import { initStore, startClock, addCount, setBanStatus, serverRenderClock } from '../store'
import withRedux from 'next-redux-wrapper'
import Link from 'next/link'
import IsThereABurnBan from '../components/IsThereABurnBan'
// checking - #9a9a9a
// success - #8bc34a

class Index extends Component {
  static getInitialProps ({ store, isServer }) {
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