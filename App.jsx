import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'bingo-netlify-app-v1';
const ENTRY_FEE = 5;
const PAYOUT_PERCENT = 0.8;
const NUMBER_MIN = 1;
const NUMBER_MAX = 49;
const NUMBERS_PER_PLAYER = 6;
const DRAW_COUNT = 6;

function initialState() {
  return {
    round: 1,
    week: 1,
    weeklyDraws: [],
    players: [],
    lastWinner: null,
    allowDuplicateSets: true,
  };
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function parseNumbers(text) {
  return uniqueSorted(
    text
      .split(/[^\d]+/)
      .map((v) => Number(v.trim()))
      .filter((v) => !Number.isNaN(v))
  );
}

function generateRandomDraw() {
  const pool = Array.from({ length: NUMBER_MAX }, (_, i) => i + 1);
  const chosen = [];

  while (chosen.length < DRAW_COUNT) {
    const index = Math.floor(Math.random() * pool.length);
    chosen.push(pool[index]);
    pool.splice(index, 1);
  }

  return chosen.sort((a, b) => a - b);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(value);
}

function sameNumberSet(a, b) {
  if (a.length !== b.length) return false;
  const aa = [...a].sort((x, y) => x - y);
  const bb = [...b].sort((x, y) => x - y);
  return aa.every((n, i) => n === bb[i]);
}

function buildMarkedNumbers(playerNumbers, weeklyDraws) {
  const drawn = new Set(weeklyDraws.flatMap((item) => item.numbers));
  return playerNumbers.filter((n) => drawn.has(n));
}

function numberClass(marked) {
  return marked ? 'ball marked' : 'ball';
}

export default function App() {
  const [state, setState] = useState(initialState());
  const [playerName, setPlayerName] = useState('');
  const [numbersText, setNumbersText] = useState('');
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setState(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load state', error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const playersWithStatus = useMemo(() => {
    return state.players.map((player) => {
      const markedNumbers = buildMarkedNumbers(player.numbers, state.weeklyDraws);
      const matchedCount = markedNumbers.length;
      return {
        ...player,
        markedNumbers,
        matchedCount,
        isWinner: player.active && matchedCount === NUMBERS_PER_PLAYER,
      };
    });
  }, [state.players, state.weeklyDraws]);

  const activePlayers = playersWithStatus.filter((player) => player.active);
  const currentWinners = activePlayers.filter((player) => player.isWinner);
  const allDrawnNumbers = uniqueSorted(state.weeklyDraws.flatMap((week) => week.numbers));
  const totalTakings = activePlayers.length * ENTRY_FEE * state.week;
  const payoutAmount = totalTakings * PAYOUT_PERCENT;
  const retainedAmount = totalTakings - payoutAmount;

  function addPlayer() {
    setJoinError('');
    const parsed = parseNumbers(numbersText);

    if (!playerName.trim()) {
      setJoinError('Enter a player name.');
      return;
    }

    if (parsed.length !== NUMBERS_PER_PLAYER) {
      setJoinError('Each player must choose exactly 6 different numbers.');
      return;
    }

    if (parsed.some((n) => n < NUMBER_MIN || n > NUMBER_MAX)) {
      setJoinError('Numbers must all be between 1 and 49.');
      return;
    }

    if (!state.allowDuplicateSets && state.players.some((p) => p.active && sameNumberSet(p.numbers, parsed))) {
      setJoinError('That exact 6-number set is already in use.');
      return;
    }

    const newPlayer = {
      id: crypto.randomUUID(),
      name: playerName.trim(),
      numbers: parsed,
      joinedWeek: state.week,
      active: true,
    };

    setState((prev) => ({ ...prev, players: [...prev.players, newPlayer] }));
    setPlayerName('');
    setNumbersText('');
  }

  function togglePlayer(id) {
    setState((prev) => ({
      ...prev,
      players: prev.players.map((player) =>
        player.id === id ? { ...player, active: !player.active } : player
      ),
    }));
  }

  function removePlayer(id) {
    setState((prev) => ({
      ...prev,
      players: prev.players.filter((player) => player.id !== id),
    }));
  }

  function runDraw() {
    if (activePlayers.length === 0 || currentWinners.length > 0) return;

    const numbers = generateRandomDraw();
    const draw = {
      week: state.week,
      numbers,
      drawnAt: new Date().toISOString(),
    };

    const projectedDraws = [...state.weeklyDraws, draw];
    const winners = state.players.filter(
      (player) => player.active && buildMarkedNumbers(player.numbers, projectedDraws).length === NUMBERS_PER_PLAYER
    );

    if (winners.length > 0) {
      const splitPrize = payoutAmount / winners.length;
      setState((prev) => ({
        ...prev,
        weeklyDraws: projectedDraws,
        lastWinner: {
          round: prev.round,
          week: prev.week,
          names: winners.map((winner) => winner.name),
          drawNumbers: numbers,
          totalTakings,
          payoutAmount,
          splitPrize,
        },
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      weeklyDraws: projectedDraws,
      week: prev.week + 1,
    }));
  }

  function startNewRound() {
    setState((prev) => ({
      ...prev,
      round: prev.round + 1,
      week: 1,
      weeklyDraws: [],
      players: prev.players.map((player) => ({ ...player, active: true, joinedWeek: 1 })),
    }));
  }

  function resetAll() {
    setState(initialState());
    setPlayerName('');
    setNumbersText('');
    setJoinError('');
  }

  return (
    <div className="page-shell">
      <div className="container">
        <header className="hero card">
          <div>
            <p className="eyebrow">Netlify-ready prototype</p>
            <h1>Weekly Number Bingo Club</h1>
            <p className="subtitle">
              Players choose 6 numbers from 1 to 49. Each week, 6 random numbers are drawn until someone has all 6 numbers marked. The winner gets 80% of all takings.
            </p>
          </div>
          <div className="hero-actions">
            <button className="primary" onClick={runDraw}>Run Weekly Draw</button>
            <button className="secondary" onClick={startNewRound}>Start New Round</button>
            <button className="danger" onClick={resetAll}>Reset</button>
          </div>
        </header>

        <section className="stats-grid">
          <div className="card stat-card">
            <span className="label">Round</span>
            <strong>{state.round}</strong>
            <span>Current week: {state.week}</span>
          </div>
          <div className="card stat-card">
            <span className="label">Active players</span>
            <strong>{activePlayers.length}</strong>
            <span>$5 per player per week</span>
          </div>
          <div className="card stat-card">
            <span className="label">Takings</span>
            <strong>{formatCurrency(totalTakings)}</strong>
            <span>Payout: {formatCurrency(payoutAmount)}</span>
          </div>
          <div className="card stat-card">
            <span className="label">Retained 20%</span>
            <strong>{formatCurrency(retainedAmount)}</strong>
            <span>Drawn numbers: {allDrawnNumbers.length}</span>
          </div>
        </section>

        {state.lastWinner && (
          <section className="card winner-banner">
            <h2>Last winner</h2>
            <p>
              <strong>{state.lastWinner.names.join(', ')}</strong> won round {state.lastWinner.round} on week {state.lastWinner.week}.
            </p>
            <p>Winning draw: {state.lastWinner.drawNumbers.join(', ')}</p>
            <p>Total takings: {formatCurrency(state.lastWinner.totalTakings)}</p>
            <p>Total payout: {formatCurrency(state.lastWinner.payoutAmount)}</p>
            <p>Prize per winner: {formatCurrency(state.lastWinner.splitPrize)}</p>
          </section>
        )}

        {currentWinners.length > 0 && (
          <section className="card info-banner">
            <h2>Current round complete</h2>
            <p>{currentWinners.map((player) => player.name).join(', ')} have all 6 numbers marked.</p>
            <p>Start a new round to continue.</p>
          </section>
        )}

        <section className="layout-grid">
          <div className="card">
            <h2>Add player</h2>
            <div className="form-grid">
              <label>
                Name
                <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Sean" />
              </label>
              <label>
                6 numbers
                <input
                  value={numbersText}
                  onChange={(e) => setNumbersText(e.target.value)}
                  placeholder="3, 8, 14, 22, 37, 49"
                />
              </label>
            </div>
            {joinError && <p className="error-text">{joinError}</p>}
            <div className="inline-controls">
              <button className="primary" onClick={addPlayer}>Add Player</button>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={state.allowDuplicateSets}
                  onChange={(e) => setState((prev) => ({ ...prev, allowDuplicateSets: e.target.checked }))}
                />
                Allow duplicate number sets
              </label>
            </div>
          </div>

          <div className="card">
            <h2>Draw history</h2>
            {state.weeklyDraws.length === 0 ? (
              <p className="muted">No weekly draws yet.</p>
            ) : (
              <div className="history-list">
                {[...state.weeklyDraws].reverse().map((draw) => (
                  <div className="history-item" key={`${draw.week}-${draw.drawnAt}`}>
                    <div>
                      <strong>Week {draw.week}</strong>
                      <p>{new Date(draw.drawnAt).toLocaleString('en-AU')}</p>
                    </div>
                    <div className="balls-row">
                      {draw.numbers.map((n) => (
                        <span className="ball small marked" key={n}>{n}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <h2>Players</h2>
          {playersWithStatus.length === 0 ? (
            <p className="muted">No players yet.</p>
          ) : (
            <div className="players-grid">
              {playersWithStatus.map((player) => (
                <article className="player-card" key={player.id}>
                  <div className="player-head">
                    <div>
                      <h3>{player.name}</h3>
                      <p>Week joined: {player.joinedWeek}</p>
                    </div>
                    <span className="pill">{player.matchedCount}/6</span>
                  </div>

                  <div className="balls-row">
                    {player.numbers.map((n) => (
                      <span key={n} className={numberClass(player.markedNumbers.includes(n))}>{n}</span>
                    ))}
                  </div>

                  <div className="player-actions">
                    <label className="checkbox-row">
                      <input type="checkbox" checked={player.active} onChange={() => togglePlayer(player.id)} />
                      Included in draw
                    </label>
                    <button className="text-button" onClick={() => removePlayer(player.id)}>Remove</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card note-box">
          <h2>Before you use this publicly</h2>
          <p>
            This version uses browser storage only, so it is ideal for testing on Netlify but not for real public signups from multiple devices.
          </p>
          <p>
            For a live multi-user version, next step is adding Supabase or Firebase for shared data, login, and payments.
          </p>
        </section>
      </div>
    </div>
  );
}
