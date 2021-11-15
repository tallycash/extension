import { createSelector, EntityId } from "@reduxjs/toolkit"
import { AccountState } from "../accounts"
import { UIState } from "../ui"
import { ActivitiesState, ActivityItem } from "../activities"

export const selectCurrentAccountActivitiesWithTimestamps = createSelector(
  (state: {
    ui: UIState
    activities: ActivitiesState
    account: AccountState
  }) => state,
  ({ activities, ui, account }) => {
    const currentAccountActivities = activities[ui.selectedAccount?.address]
    return {
      activities: currentAccountActivities?.ids.map(
        (id: EntityId): ActivityItem | undefined => {
          const activityItem = currentAccountActivities.entities[id]
          if (activityItem) {
            return {
              ...activityItem,
              timestamp:
                activityItem?.blockHeight &&
                account.blocks[activityItem?.blockHeight]?.timestamp,
            }
          }
          return undefined
        }
      ),
    }
  }
)
