import { combineReducers } from "redux"

import accountsReducer from "./accounts"
import assetsReducer from "./assets"
import activitiesReducer from "./activities"
import keyringsReducer from "./keyrings"
import swapReducer from "./0x-swap"
import limitReducer from "./limit-orders"
import transactionConstructionReducer from "./transaction-construction"
import uiReducer from "./ui"
import dappPermissionReducer from "./dapp-permission"

const mainReducer = combineReducers({
  account: accountsReducer,
  assets: assetsReducer,
  activities: activitiesReducer,
  keyrings: keyringsReducer,
  swap: swapReducer,
  transactionConstruction: transactionConstructionReducer,
  ui: uiReducer,
  dappPermission: dappPermissionReducer,
  limit: limitReducer,
})

export default mainReducer

export type RootState = ReturnType<typeof mainReducer>
