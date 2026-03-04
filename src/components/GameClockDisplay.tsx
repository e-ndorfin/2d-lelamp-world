import { useEffect, useState } from 'react';
import { GAME_DAY_DURATION, GAME_NIGHT_START_RATIO } from '../../convex/constants';

type TimePhase = {
  label: string;
  icon: string;
  bgColor: string;
  textColor: string;
  barColor: string;
};

const PHASES: { maxRatio: number; phase: TimePhase }[] = [
  {
    maxRatio: 0.1,
    phase: {
      label: 'Dawn',
      icon: '🌅',
      bgColor: 'rgba(45, 30, 60, 0.85)',
      textColor: '#f0c27f',
      barColor: '#f0c27f',
    },
  },
  {
    maxRatio: 0.35,
    phase: {
      label: 'Morning',
      icon: '☀️',
      bgColor: 'rgba(30, 50, 80, 0.85)',
      textColor: '#ffd866',
      barColor: '#ffd866',
    },
  },
  {
    maxRatio: 0.5,
    phase: {
      label: 'Noon',
      icon: '🌞',
      bgColor: 'rgba(30, 50, 80, 0.85)',
      textColor: '#ffe088',
      barColor: '#ffe088',
    },
  },
  {
    maxRatio: GAME_NIGHT_START_RATIO,
    phase: {
      label: 'Afternoon',
      icon: '🌤️',
      bgColor: 'rgba(40, 45, 70, 0.85)',
      textColor: '#e8a850',
      barColor: '#e8a850',
    },
  },
  {
    maxRatio: 0.85,
    phase: {
      label: 'Evening',
      icon: '🌆',
      bgColor: 'rgba(25, 20, 50, 0.9)',
      textColor: '#c084fc',
      barColor: '#9966cc',
    },
  },
  {
    maxRatio: 1.0,
    phase: {
      label: 'Night',
      icon: '🌙',
      bgColor: 'rgba(15, 12, 35, 0.9)',
      textColor: '#7dd3fc',
      barColor: '#4a6fa5',
    },
  },
];

function getPhase(timeOfDay: number): TimePhase {
  for (const { maxRatio, phase } of PHASES) {
    if (timeOfDay < maxRatio) return phase;
  }
  return PHASES[PHASES.length - 1].phase;
}

function formatGameTime(timeOfDay: number): string {
  // Map 0-1 ratio to 6:00 AM - 6:00 AM (24h cycle)
  const totalMinutes = Math.floor(timeOfDay * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) + 6; // start at 6 AM
  const minutes = totalMinutes % 60;
  const h = hours % 24;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export default function GameClockDisplay() {
  const [gameTime, setGameTime] = useState(() => {
    const now = Date.now();
    return {
      dayNumber: Math.floor(now / GAME_DAY_DURATION),
      timeOfDay: (now % GAME_DAY_DURATION) / GAME_DAY_DURATION,
    };
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setGameTime({
        dayNumber: Math.floor(now / GAME_DAY_DURATION),
        timeOfDay: (now % GAME_DAY_DURATION) / GAME_DAY_DURATION,
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const phase = getPhase(gameTime.timeOfDay);
  const nightStart = GAME_NIGHT_START_RATIO;

  return (
    <div
      className="font-body text-xs select-none pointer-events-none"
      style={{
        background: phase.bgColor,
        color: phase.textColor,
        borderRadius: '6px',
        padding: '6px 10px',
        minWidth: '140px',
        border: `1px solid ${phase.barColor}44`,
      }}
    >
      {/* Day number + phase */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span style={{ fontSize: '10px', opacity: 0.7 }}>Day {gameTime.dayNumber + 1}</span>
        <span>
          {phase.icon} {phase.label}
        </span>
      </div>

      {/* Clock time */}
      <div className="text-center mb-1.5" style={{ fontSize: '14px', letterSpacing: '1px' }}>
        {formatGameTime(gameTime.timeOfDay)}
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: '4px',
          borderRadius: '2px',
          background: 'rgba(255,255,255,0.1)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Night zone marker */}
        <div
          style={{
            position: 'absolute',
            left: `${nightStart * 100}%`,
            right: 0,
            top: 0,
            bottom: 0,
            background: 'rgba(100, 100, 180, 0.3)',
          }}
        />
        {/* Current time indicator */}
        <div
          style={{
            width: `${gameTime.timeOfDay * 100}%`,
            height: '100%',
            background: phase.barColor,
            borderRadius: '2px',
            transition: 'width 1s linear',
          }}
        />
      </div>
    </div>
  );
}
