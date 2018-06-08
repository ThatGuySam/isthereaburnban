/* eslint-env jest */

import { shallow } from 'enzyme'
import React from 'react'
import renderer from 'react-test-renderer'
import configureStore from 'redux-mock-store'
import thunk from 'redux-thunk'

import getOKBurnBans from '../helpers/getOKBurnBans'
import App from '../pages/index.js'

describe('Server', () => {
  
  it('Can Request OK Burn Bans"',  async () => {
    const burnBans = await getOKBurnBans()
    
    // expect(burnBans).toMatchSnapshot()
    // expect.objectContaining({
    //     x: expect.any(Number),
    //     y: expect.any(Number),
    //   }));
    // }
    expect(burnBans).toContainEqual(
      expect.objectContaining({
        "id": expect.any(Number),
        "name": expect.any(String),
        "status": expect.any(String),
        "inEffect": expect.any(Boolean)
      })
    )
  })
  
})

// describe('With Snapshot Testing', () => {
//   it('App shows "Hello world!"', () => {
//     const component = renderer.create(<App />)
//     const tree = component.toJSON()
//     expect(tree).toMatchSnapshot()
//   })
// })

// it('renders correctly', () => {
//   const tree = renderer
//     .create(<App />)
//     .toJSON()
//   expect(tree).toMatchSnapshot()
// });