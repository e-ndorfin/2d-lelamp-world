import { GAME_DAY_DURATION, GAME_NIGHT_START_RATIO } from '../constants';

export interface GameTime {
  dayNumber: number;
  timeOfDay: number; // 0.0–1.0 within current day cycle
  isNight: boolean;
}

export function getGameTimeOfDay(now: number): GameTime {
  const dayNumber = Math.floor(now / GAME_DAY_DURATION);
  const timeOfDay = (now % GAME_DAY_DURATION) / GAME_DAY_DURATION;
  const isNight = timeOfDay >= GAME_NIGHT_START_RATIO;
  return { dayNumber, timeOfDay, isNight };
}
