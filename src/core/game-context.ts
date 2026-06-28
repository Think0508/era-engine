import type { GameContext, LocationData, EntityData, GameTimeData } from './types'
import { entitySystem } from './entity-system'
import { eventBus } from './event-bus'

const NIGHT_START_HOUR = 22
const DAYS_PER_MONTH = 30
const MONTHS_PER_YEAR = 12

class GameContextManager {
  private player: EntityData | null = null
  private location: LocationData | null = null
  private time: GameTimeData = {
    minute: 0, hour: 8, day: 1, month: 1, year: 1
  }

  getContext(): GameContext {
    return {
      player: this.player,
      location: this.location,
      time: { ...this.time },
      getEntity: (type: string, id: string) => entitySystem.get(type, id)
    }
  }

  setPlayer(charId: string): void {
    this.player = entitySystem.get('character', charId)
    if (!this.player) {
      throw new Error(`玩家角色 '${charId}' 不存在`)
    }
  }

  setLocation(location: LocationData): void {
    this.location = location
  }

  async advanceTime(minutes: number): Promise<void> {
    let remaining = minutes
    while (remaining > 0) {
      const minutesToNextHour = 60 - this.time.minute
      if (remaining < minutesToNextHour) {
        this.time.minute += remaining
        remaining = 0
      } else {
        this.time.minute = 0
        this.time.hour++
        remaining -= minutesToNextHour
        await eventBus.emit('game:hour_changed', { hour: this.time.hour })

        if (this.time.hour === NIGHT_START_HOUR) {
          await eventBus.emit('game:night_start', { hour: this.time.hour })
        }

        if (this.time.hour >= 24) {
          this.time.hour -= 24
          this.time.day++
          await eventBus.emit('game:new_day', { day: this.time.day })
          if (this.time.day > DAYS_PER_MONTH) {
            this.time.day = 1
            this.time.month++
            if (this.time.month > MONTHS_PER_YEAR) {
              this.time.month = 1
              this.time.year++
            }
          }
        }
      }
    }
  }

  reset(): void {
    this.player = null
    this.location = null
    this.time = { minute: 0, hour: 8, day: 1, month: 1, year: 1 }
  }
}

export const gameContext = new GameContextManager()
