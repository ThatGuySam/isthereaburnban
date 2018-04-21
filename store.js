import { createStore, applyMiddleware } from 'redux'
import { composeWithDevTools } from 'redux-devtools-extension'
import thunkMiddleware from 'redux-thunk'
import getMessage from './helpers/messages'

const readyStatus = getMessage('ready')

const exampleInitialState = {
  lastUpdate: 0,
  light: false,
  count: 0,
  banStatus: readyStatus
}

export const actionTypes = {
  ADD: 'ADD',
  SET_BAN_STATUS: 'SET_BAN_STATUS',
  TICK: 'TICK'
}

// REDUCERS
export const reducer = (state = exampleInitialState, action) => {
  switch (action.type) {
    case actionTypes.TICK:
      return Object.assign({}, state, { lastUpdate: action.ts, light: !!action.light })
    case actionTypes.ADD:
      return Object.assign({}, state, {
        count: state.count + 1
      })
    case actionTypes.SET_BAN_STATUS:
      // console.log('SET_BAN_STATUS fired', action)
      return Object.assign({}, state, {
        banStatus: action.banStatus
      })
    default: return state
  }
}

// ACTIONS
export const serverRenderClock = (isServer) => dispatch => {
  return dispatch({ type: actionTypes.TICK, light: !isServer, ts: Date.now() })
}

export const startClock = () => dispatch => {
  return setInterval(() => dispatch({ type: actionTypes.TICK, light: true, ts: Date.now() }), 1000)
}

export const addCount = () => dispatch => {
  return dispatch({ type: actionTypes.ADD })
}

export const setBanStatus = (banStatus) => dispatch => {
  // console.log('setBanStatus fired', dispatch)
  return dispatch({ type: actionTypes.SET_BAN_STATUS, banStatus: banStatus })
}

export const initStore = (initialState = exampleInitialState) => {
  return createStore(reducer, initialState, composeWithDevTools(applyMiddleware(thunkMiddleware)))
}