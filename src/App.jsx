import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import './App.css'

const COLORS = ['#6f7dfb', '#ff9f43', '#41d3a2', '#f76b8a', '#7ad7f0', '#e85d04']

const adjustColor = (hex, amount) => {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  const clamp = (v) => Math.max(0, Math.min(255, v))
  const r = clamp((num >> 16) + amount)
  const g = clamp(((num >> 8) & 0x00ff) + amount)
  const b = clamp((num & 0x0000ff) + amount)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

const PIP_POSITIONS = {
  1: ['center'],
  2: ['top-left', 'bottom-right'],
  3: ['top-left', 'center', 'bottom-right'],
  4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
  6: ['top-left', 'top-right', 'center-left', 'center-right', 'bottom-left', 'bottom-right'],
}

const rollDice = (count) =>
  Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1)

const pipLabel = (pip) => (pip === 1 ? 'ones (wild)' : `${pip}s`)

const formatBid = (bid) => (bid ? `${bid.quantity} ${pipLabel(bid.pip)}` : 'No bids yet')

const isBidValid = (currentBid, candidate) => {
  if (!candidate?.quantity || !candidate?.pip) return false
  if (!currentBid) return true

  const { quantity, pip } = candidate
  const { quantity: cq, pip: cp } = currentBid

  if (cp === 1 && pip !== 1) {
    return quantity >= cq * 2
  }

  if (cp !== 1 && pip === 1) {
    return quantity >= Math.ceil(cq / 2)
  }

  if (cp === 1 && pip === 1) {
    return quantity > cq
  }

  return quantity > cq || (quantity === cq && pip > cp)
}

const suggestedBid = (currentBid) => {
  if (!currentBid) return { quantity: 1, pip: 2 }
  if (currentBid.pip === 1) return { quantity: currentBid.quantity * 2, pip: 2 }
  return { quantity: currentBid.quantity + 1, pip: currentBid.pip }
}

const loseDie = (list, id) =>
  list.map((player) =>
    player.id === id ? { ...player, diceCount: Math.max(0, player.diceCount - 1) } : player,
  )

const getNextActivePlayerId = (id, roster) => {
  const active = roster.filter((p) => p.diceCount > 0)
  if (active.length === 0) return null
  const idx = active.findIndex((p) => p.id === id)
  if (idx === -1) return active[0].id
  return active[(idx + 1) % active.length].id
}

const Dice = ({ value, highlight, style }) => (
  <div className={`die value-${value} ${highlight ? 'highlight' : ''}`} style={style}>
    {PIP_POSITIONS[value].map((pos) => (
      <span key={pos} className={`pip ${pos}`} />
    ))}
  </div>
)

const cupPalette = (base) => {
  const main = base || '#8b5cf6'
  return {
    base: main,
    dark: adjustColor(main, -30),
    light: adjustColor(main, 50),
  }
}

const Cup = ({ color, animate, slam, small, muted, tilt }) => {
  const palette = cupPalette(color)
  return (
    <div
      className={`cup ${animate && !muted ? 'shake' : ''} ${slam && !muted ? 'slam' : ''} ${tilt ? 'tilt-open' : ''} ${
        small ? 'small' : ''
      } ${muted ? 'muted' : ''}`}
      style={{
        '--cup-base': palette.base,
        '--cup-dark': palette.dark,
        '--cup-light': palette.light,
      }}
    >
      <div className="cup-shell">
        <div className="cup-body">
          <div className="cup-top-band" />
          <div className="cup-band band-1" />
          <div className="cup-band band-2" />
          <div className="cup-band band-lower" />
          <div className="cup-shine" />
        </div>
        <div className="cup-foot" />
      </div>
      <div className="cup-shadow" />
    </div>
  )
}

const PlayerBadge = ({ player, isTurn, isBidder }) => (
  <div className={`player-badge ${player.diceCount === 0 ? 'out' : ''}`}>
    <div className="badge-top">
      <span className="swatch" style={{ background: player.color }} />
      <span className="name">{player.name}</span>
    </div>
    <div className="badge-bottom">
      <span className="dice-count">{player.diceCount} dice</span>
      <span className="tags">
        {isTurn && <span className="tag">turn</span>}
        {isBidder && <span className="tag">bidder</span>}
      </span>
    </div>
  </div>
)

function App() {
  const [playerCount, setPlayerCount] = useState(3)
  const [showCountMenu, setShowCountMenu] = useState(false)
  const [nameInputs, setNameInputs] = useState([
    'Player 1',
    'Player 2',
    'Player 3',
    'Player 4',
    'Player 5',
    'Player 6',
  ])
  const [players, setPlayers] = useState([])
  const [phase, setPhase] = useState('lobby')
  const [shakeState, setShakeState] = useState('idle')
  const [currentBid, setCurrentBid] = useState(null)
  const [bidQuantity, setBidQuantity] = useState(1)
  const [bidPip, setBidPip] = useState(2)
  const [currentTurnId, setCurrentTurnId] = useState(null)
  const [startingPlayerId, setStartingPlayerId] = useState(null)
  const [currentRevealIndex, setCurrentRevealIndex] = useState(0)
  const [showingDice, setShowingDice] = useState(false)
  const [showAllDice, setShowAllDice] = useState(false)
  const [round, setRound] = useState(1)
  const [resolutionInfo, setResolutionInfo] = useState(null)
  const [announcement, setAnnouncement] = useState('Gather the crew, bluff boldly.')
  const revealDiceRef = useRef(null)
  const [showRules, setShowRules] = useState(false)
  const playersRef = useRef(players)
  const gameRef = useRef({
    players: [],
    round: 1,
    startingPlayerId: null,
    currentTurnId: null,
  })

  const activePlayers = useMemo(
    () => players.filter((p) => p.diceCount > 0),
    [players],
  )

  const currentTurnPlayer = players.find((p) => p.id === currentTurnId)
  const revealingPlayer = activePlayers[currentRevealIndex]
  const bidder = currentBid ? players.find((p) => p.id === currentBid.bidderId) : null

  useEffect(() => {
    playersRef.current = players
  }, [players])

  const togglePlayerCount = () => setShowCountMenu((v) => !v)
  const choosePlayerCount = (num) => {
    setPlayerCount(num)
    setShowCountMenu(false)
  }

  const handleStartGame = () => {
    const roster = nameInputs.slice(0, playerCount).map((name, idx) => ({
      id: idx + 1,
      name: name.trim() || `Player ${idx + 1}`,
      color: COLORS[idx % COLORS.length],
      diceCount: 5,
      dice: [],
    }))

    setPlayers(roster)
    playersRef.current = roster
    setRound(1)
    setStartingPlayerId(roster[0]?.id ?? null)
    setCurrentTurnId(roster[0]?.id ?? null)
    setPhase('shake')
    setAnnouncement('Tap "Shake Cups" to roll everyone at once.')
    setCurrentBid(null)
    setBidQuantity(1)
    setBidPip(2)
    setCurrentRevealIndex(0)
    setShowingDice(false)
    setShowAllDice(false)
    setResolutionInfo(null)
  }

  const handleShake = () => {
    if (shakeState === 'shaking') return

    const rolled = players.map((player) => ({
      ...player,
      dice: player.diceCount > 0 ? rollDice(player.diceCount) : [],
    }))

    setPlayers(rolled)
    setShakeState('shaking')
    setAnnouncement('Cups are rattling...')

    setTimeout(() => setShakeState('slammed'), 850)
    setTimeout(() => {
      setShakeState('idle')
      setPhase('reveal')
      setCurrentRevealIndex(0)
      setShowingDice(false)
      setShowAllDice(false)
      setAnnouncement('Pass the device. Each player peeks in private.')
    }, 1600)
  }

  const handleRevealHide = () => {
    const nextIndex = currentRevealIndex + 1
    setShowingDice(false)

    if (nextIndex >= activePlayers.length) {
      const starter = activePlayers.find((p) => p.id === startingPlayerId)?.id ?? activePlayers[0]?.id
      const suggestion = suggestedBid(currentBid)

      setCurrentTurnId(starter ?? null)
      setBidQuantity(suggestion.quantity)
      setBidPip(suggestion.pip)
      setPhase('bidding')
      setAnnouncement('Bid higher, or call LIAR / SPOT ON.')
    } else {
      setCurrentRevealIndex(nextIndex)
    }
  }

  const handleBid = () => {
    const candidate = { quantity: bidQuantity, pip: bidPip }
    if (!isBidValid(currentBid, candidate)) return

    const nextPlayer = getNextActivePlayerId(currentTurnId, players)

    setCurrentBid({ ...candidate, bidderId: currentTurnId })
    setCurrentTurnId(nextPlayer)
    setAnnouncement(`New high bid: ${formatBid(candidate)}`)

    const suggestion = suggestedBid(candidate)
    setBidQuantity(suggestion.quantity)
    setBidPip(suggestion.pip)
  }

const countMatchesInList = (list, pip) =>
  list.reduce((total, player) => {
    if (player.diceCount === 0) return total
    const matches =
      pip === 1
        ? player.dice.filter((d) => d === 1).length
        : player.dice.filter((d) => d === pip || d === 1).length
    return total + matches
  }, 0)

  const handleCall = (type) => {
    if (!currentBid) return

    const callerId = currentTurnId
    setPhase('showdown')
    setShowAllDice(true)
    setResolutionInfo({ type, callerId, status: 'calculating', bid: currentBid })
    setAnnouncement(type === 'liar' ? 'LIAR!' : 'SPOT ON!')

    setTimeout(() => {
      let detail = ''
      let outcome = ''
      let nextStarter = null
      let winner = null
      let totalMatches = 0

      const snapshot = playersRef.current
      totalMatches = countMatchesInList(snapshot, currentBid.pip)
      let updated = [...snapshot]
      let roundLoserId = callerId

      if (type === 'liar') {
        const bidHolds = totalMatches >= currentBid.quantity
        if (bidHolds) {
          updated = loseDie(updated, callerId)
          detail = 'Bid holds. Caller loses a die.'
          outcome = 'bid-stands'
          roundLoserId = callerId
        } else {
          updated = loseDie(updated, currentBid.bidderId)
          detail = 'Caught the bluff. Bidder loses a die.'
          outcome = 'bluff'
          roundLoserId = currentBid.bidderId
        }
      } else {
        const exact = totalMatches === currentBid.quantity
        if (exact) {
          updated = updated.map((p) =>
            p.id === callerId || p.diceCount === 0 ? p : { ...p, diceCount: Math.max(0, p.diceCount - 1) },
          )
          detail = 'Spot on! Everyone else drops a die.'
          outcome = 'exact'
          roundLoserId = callerId
        } else {
          updated = loseDie(updated, callerId)
          detail = 'Not exact. Caller loses a die.'
          outcome = 'missed'
          roundLoserId = callerId
        }
      }

      const remaining = updated.filter((p) => p.diceCount > 0)
      winner = remaining.length === 1 ? remaining[0] : null
      const loserPlayer =
        updated.find((p) => p.id === roundLoserId && p.diceCount > 0) ??
        updated.find((p) => p.id === roundLoserId)
      nextStarter = winner ? winner.id : loserPlayer?.id ?? getNextActivePlayerId(callerId, updated)

      setPlayers(updated)
      playersRef.current = updated
      setStartingPlayerId(nextStarter)
      setCurrentTurnId(nextStarter)
      setCurrentBid(null)
      setResolutionInfo({
        type,
        callerId,
        status: 'resolved',
        totalMatches,
        detail,
        outcome,
        bid: currentBid,
        winner,
      })

      if (winner) {
        setPhase('game-over')
        setAnnouncement(`🏆 ${winner.name} wins!`)
      } else {
        setPhase('round-end')
        setAnnouncement(detail)
      }
    }, 1100)
  }

  const handleNextRound = (resetGameArg = false) => {
    const reset = resetGameArg === true
    const snapshot = [...players]
    const cleaned = snapshot.map((p) => ({
      ...p,
      dice: [],
      diceCount: reset ? 5 : p.diceCount,
    }))
    const nextStarter =
      cleaned.find((p) => p.id === startingPlayerId && p.diceCount > 0)?.id ??
      cleaned.find((p) => p.diceCount > 0)?.id ??
      null

    setPlayers(cleaned)
    playersRef.current = cleaned
    setStartingPlayerId(nextStarter)
    setCurrentTurnId(nextStarter)
    const nextRound = reset ? 1 : round + 1
    setRound(nextRound)
    setPhase('shake')
    setShakeState('idle')
    setResolutionInfo(null)
    setShowAllDice(false)
    setCurrentBid(null)
    setBidQuantity(1)
    setBidPip(2)
    setAnnouncement(reset ? 'Fresh game. Shake to roll.' : 'Shake to start the next round.')
    setCurrentRevealIndex(0)
    setShowingDice(false)
  }

  const handleRestart = () => {
    gameRef.current = {
      players: [],
      round: 1,
      startingPlayerId: null,
      currentTurnId: null,
    }
    setPlayers([])
    setPhase('lobby')
    setCurrentBid(null)
    setRound(1)
    setAnnouncement('Gather the crew, bluff boldly.')
    setCurrentTurnId(null)
    setStartingPlayerId(null)
    setResolutionInfo(null)
    setShowAllDice(false)
    setShakeState('idle')
    setCurrentRevealIndex(0)
    setShowingDice(false)
  }

  const validBid = isBidValid(currentBid, { quantity: bidQuantity, pip: bidPip })

  useEffect(() => {
    if (showingDice && revealDiceRef.current) {
      const diceEls = revealDiceRef.current.querySelectorAll('.die')
      gsap.killTweensOf(diceEls)
      gsap.fromTo(
        diceEls,
        {
          x: () => -40 + Math.random() * 30,
          y: () => -50 + Math.random() * 35,
          rotation: () => -18 + Math.random() * 36,
          scale: 0.82,
          opacity: 0,
        },
        {
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
          opacity: 1,
          stagger: 0.08,
          duration: 0.55,
          ease: 'back.out(1.8)',
        },
      )
    }
  }, [showingDice, revealingPlayer])

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Local party game · 3–6 players</p>
          <h1>Liar’s Dice</h1>
          <p className="subhead">Probability, bluffing, and nerve on a single device.</p>
        </div>
        <div className="hero-right">
          <span className="round-pill accent-pill">Round {round}</span>
          <p className="announcement">{announcement}</p>
          <button className="ghost small rules-btn" onClick={() => setShowRules(true)}>
            Rules
          </button>
        </div>
      </header>

      {phase === 'lobby' && (
        <section className="panel glass">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Setup</p>
              <h2>Lobby</h2>
            </div>
            <button className="primary" onClick={handleStartGame}>
              Start Game
            </button>
          </div>
          <div className="form-grid">
            <div className="player-count-picker">
              <span>Players:</span>
              <div className="count-toggle-wrap">
                <button className="count-toggle" type="button" onClick={togglePlayerCount}>
                  {playerCount} players ▾
                </button>
                {showCountMenu && (
                  <div className="count-menu">
                    {[3, 4, 5, 6].map((num) => (
                      <button key={num} onClick={() => choosePlayerCount(num)}>
                        {num} players
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="names-grid">
              {Array.from({ length: playerCount }).map((_, idx) => (
                <label key={idx} className="input-field">
                  <span>Player {idx + 1}</span>
                  <input
                    type="text"
                    value={nameInputs[idx]}
                    onChange={(e) => {
                      const next = [...nameInputs]
                      next[idx] = e.target.value
                      setNameInputs(next)
                    }}
                    placeholder={`Player ${idx + 1}`}
                  />
                </label>
              ))}
            </div>
          </div>
          <ul className="tiny-list">
            <li>Each player starts with 5 dice and a matching cup color.</li>
            <li>Ones are wild. Bidding ones halves the quantity; leaving ones doubles it.</li>
            <li>Pass the device for private reveals—no peeking.</li>
          </ul>
        </section>
      )}

      {phase === 'shake' && (
        <section className="panel glass">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Phase</p>
              <h2>Shake & Slam</h2>
            </div>
            <button className="primary" onClick={handleShake} disabled={shakeState === 'shaking'}>
              {shakeState === 'shaking' ? 'Shaking...' : 'Shake Cups'}
            </button>
          </div>
          <p className="muted">
            All players roll simultaneously. The device stays in the center—feel the rumble.
          </p>
          <div className="cups-row">
            {players.map((player) => (
              <div key={player.id} className="cup-card">
                <Cup
                  color={player.color}
                  animate={shakeState === 'shaking' && player.diceCount > 0}
                  slam={shakeState === 'slammed' && player.diceCount > 0}
                  small
                  muted={player.diceCount === 0}
                />
                <div className="cup-label" style={{ color: player.color }}>
                  {player.name}
                </div>
                <div className="dice-remaining">{player.diceCount} dice</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {phase === 'reveal' && revealingPlayer && (
        <section className="panel glass reveal-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Private View</p>
              <h2>Pass to {revealingPlayer.name}</h2>
            </div>
            <span className="pill" style={{ background: `${revealingPlayer.color}33`, color: revealingPlayer.color }}>
              {revealingPlayer.diceCount} dice
            </span>
          </div>

          <div className={`secret-area ${showingDice ? 'open' : ''}`}>
            {!showingDice && <div className="no-peek">No peeking</div>}
            <div className={`secret-inner ${showingDice ? 'spill' : ''}`}>
              <Cup color={revealingPlayer.color} slam={showingDice} tilt={showingDice} />
              <div className="dice-strip" ref={revealDiceRef}>
                {showingDice &&
                  revealingPlayer.dice.map((die, idx) => (
                    <Dice key={idx} value={die} style={{ animationDelay: `${idx * 0.08}s` }} />
                  ))}
              </div>
            </div>
          </div>

          <div className="button-row">
            {!showingDice ? (
              <button className="primary" onClick={() => setShowingDice(true)}>
                Reveal Dice
              </button>
            ) : (
              <button className="primary" onClick={handleRevealHide}>
                Hide Dice &amp; Pass
              </button>
            )}
            <button className="ghost" onClick={handleRevealHide} disabled={!showingDice}>
              Next Player
            </button>
          </div>
        </section>
      )}

      {phase === 'bidding' && (
        <section className="panel glass bidding">
          <div className="bid-layout">
            <div className="scoreboard">
              <p className="eyebrow">Dice Count</p>
              {players.map((p) => (
                <PlayerBadge
                  key={p.id}
                  player={p}
                  isTurn={p.id === currentTurnId}
                  isBidder={p.id === bidder?.id}
                />
              ))}
            </div>

            <div className="bid-panel">
              <div className="turn-callout">
                {currentTurnPlayer ? (
                  <>
                    <span className="dot" style={{ background: currentTurnPlayer.color }} />
                    Turn: {currentTurnPlayer.name} — {currentTurnPlayer.diceCount} dice left
                  </>
                ) : (
                  'Select a player'
                )}
              </div>

              <div className="controls">
                <div className="control-block">
                  <p className="label">Quantity</p>
                  <div className="stepper">
                    <button onClick={() => setBidQuantity((q) => Math.max(1, q - 1))}>-</button>
                    <span className="value">{bidQuantity}</span>
                    <button onClick={() => setBidQuantity((q) => q + 1)}>+</button>
                  </div>
                </div>

                <div className="control-block">
                  <p className="label">Pip</p>
                  <div className="pip-choices">
                    {[1, 2, 3, 4, 5, 6].map((pip) => (
                      <button
                        key={pip}
                        className={`pip-button ${pip === bidPip ? 'active' : ''}`}
                        onClick={() => setBidPip(pip)}
                      >
                        {pip}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <p className="hint">Ones are wild. Bidding ones halves quantity; leaving ones doubles it.</p>

              <div className="actions">
                <button className="primary" onClick={handleBid} disabled={!validBid}>
                  Place Bid
                </button>
                <button className="warn" onClick={() => handleCall('liar')} disabled={!currentBid}>
                  Call LIAR
                </button>
                <button className="ghost" onClick={() => handleCall('spot')} disabled={!currentBid}>
                  Call SPOT ON
                </button>
              </div>

              <div className="current-bid">
                <p className="eyebrow">Current Highest Bid</p>
                {currentBid ? (
                  <div className="bid-pill">
                    <span>{formatBid(currentBid)}</span>
                    <span className="muted">by {bidder?.name ?? 'Unknown'}</span>
                  </div>
                ) : (
                  <p className="muted">No bids yet. Raise the stakes.</p>
                )}
                {!validBid && (
                  <p className="error">Bid must beat the previous one. Ones halve/ double the quantity.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {(phase === 'showdown' || phase === 'round-end' || phase === 'game-over') && (
        <section className="panel glass results">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Reveal</p>
              <h2>
                {resolutionInfo?.type === 'spot' ? 'SPOT ON' : 'LIAR'}
                {resolutionInfo?.winner ? ' — Game Over' : ''}
              </h2>
            </div>
            {resolutionInfo?.winner ? (
              <span className="pill success">🏆 {resolutionInfo.winner.name}</span>
            ) : (
              <span className="pill">{phase === 'showdown' ? 'Revealing...' : 'Round result'}</span>
            )}
          </div>

          <div className="reveal-grid">
            {players.map((player) => {
              const highlightValue = resolutionInfo?.bid?.pip
              const diceToShow = showAllDice ? player.dice : []
              return (
                <div
                  key={player.id}
                  className={`reveal-card ${player.diceCount === 0 ? 'out' : ''}`}
                  style={{ borderColor: player.color }}
                >
                  <div className="reveal-head">
                    <span className="name">{player.name}</span>
                    <span className="count">{player.diceCount} dice</span>
                  </div>
                  <div className="reveal-body center-dice">
                    {phase === 'showdown' || phase === 'round-end' || phase === 'game-over' ? null : (
                      <Cup color={player.color} slam showAllDice={showAllDice} muted={player.diceCount === 0} />
                    )}
                    <div className="dice-strip centered">
                      {diceToShow.map((die, idx) => (
                        <Dice key={idx} value={die} highlight={die === 1 || die === highlightValue} />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {resolutionInfo?.status === 'resolved' && (
            <div className="result-banner">
              <div className="big-call">{resolutionInfo.type === 'spot' ? 'SPOT ON' : 'LIAR!'}</div>
              <div className="result-detail">
                <strong>{resolutionInfo.detail}</strong>{' '}
                <span className="muted">
                  Bid was {formatBid(resolutionInfo.bid)} — counted {resolutionInfo.totalMatches} matching dice.
                </span>
              </div>
            </div>
          )}

          <div className="button-row">
            {resolutionInfo?.winner ? (
              <>
                <button className="primary" onClick={handleRestart}>
                  New Players
                </button>
                <button className="ghost" onClick={() => handleNextRound(true)}>
                  Rematch with same crew
                </button>
              </>
            ) : (
              <>
                <button className="primary" onClick={() => handleNextRound()}>
                  Next Round
                </button>
                <button className="ghost" onClick={handleRestart}>
                  Back to Lobby
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <footer className="footer">
        <div>Ones are wild. Bid bravely, doubt loudly, keep the table honest.</div>
      </footer>

      {showRules && (
        <div className="modal-backdrop" onClick={() => setShowRules(false)}>
          <div className="modal rules-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Liar’s Dice — Rules</h3>
              <button className="ghost" onClick={() => setShowRules(false)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <p>
                Goal: Be the last player with dice. Lose a challenge → lose exactly 1 die permanently. Ones are wild when
                counting (except when bidding on ones).
              </p>
              <h4>Round Order</h4>
              <ol>
                <li>Shake & slam: everyone rolls together, cups stay down.</li>
                <li>Private peek: pass the device; each player views only their dice.</li>
                <li>Bidding: clockwise, bids must increase; instead you may call LIAR or SPOT ON.</li>
                <li>Reveal & resolve: show all dice, apply losses, remove eliminated players.</li>
              </ol>
              <h4>Bids</h4>
              <ul>
                <li>Format: “X of Y” (X = quantity, Y = pip 1–6).</li>
                <li>Must beat the previous bid by higher quantity, OR same quantity with higher pip.</li>
                <li>Switching to ones halves the quantity (round up). Switching from ones doubles the quantity.</li>
              </ul>
              <h4>Special Ones Rules</h4>
              <ul>
                <li>Counting: Ones are wild for every pip except when the bid itself is on ones.</li>
                <li>Switching onto ones: halve the quantity (round up). Switching off ones: double the quantity.</li>
              </ul>
              <h4>Wild Ones</h4>
              <ul>
                <li>When counting results, ones count as any pip (except when the bid is on ones).</li>
                <li>Example: Bid “Six 5s”; dice show 4 fives + 2 ones → counts as 6 matching dice.</li>
              </ul>
              <h4>LIAR</h4>
              <ul>
                <li>Call if you think the bid is too high.</li>
                <li>Bid false → bidder loses 1 die. Bid true → caller loses 1 die.</li>
              </ul>
              <h4>SPOT ON</h4>
              <ul>
                <li>Call if you think the bid is exact.</li>
                <li>Exact → everyone else loses 1 die. Not exact → caller loses 1 die.</li>
              </ul>
              <h4>Turn & Elimination</h4>
              <ul>
                <li>Challenge loser starts the next round (if still alive).</li>
                <li>Dice never refresh until a rematch. At 0 dice you’re out and skipped.</li>
                <li>Game ends immediately when only one player has dice.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
