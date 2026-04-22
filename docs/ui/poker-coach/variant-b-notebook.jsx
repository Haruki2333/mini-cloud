// Variant B — "Coach's Notebook"
// Warm kraft paper background, ink/handwritten coaching journal vibe.
// Typography carries the design: serif body + handwritten display.

const B = {
  paper: '#F0E5CC',
  paperDark: '#E5D6B5',
  paperFold: '#D9C8A3',
  ink: '#2B221A',
  inkSoft: 'rgba(43,34,26,0.7)',
  inkFaint: 'rgba(43,34,26,0.45)',
  inkLine: 'rgba(43,34,26,0.15)',
  red: '#A43128',        // marker red
  amber: '#B8751A',      // highlighter amber
  green: '#4F6B3A',      // pencil green
  // Fonts
  serif: '"EB Garamond", Georgia, "Times New Roman", serif',
  hand: '"Caveat", "Kalam", "Marker Felt", cursive',
  mono: '"Courier Prime", "Courier New", ui-monospace, monospace',
};

function AppB({ initialScreen }) {
  const [screen, setScreen] = React.useState(initialScreen || 'input-position');
  const [hand, setHand] = React.useState({ position: null, cards: [] });

  return (
    <div style={{
      width: '100%', height: '100%',
      background: B.paper,
      color: B.ink, fontFamily: B.serif,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
      // Paper texture
      backgroundImage: `
        radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.25) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 80%, rgba(43,34,26,0.08) 0%, transparent 40%),
        repeating-linear-gradient(0deg, transparent 0 2px, rgba(43,34,26,0.015) 2px 3px)
      `,
    }}>
      <TopBarB screen={screen} />
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {screen === 'input-position' && <PositionB hand={hand} setHand={setHand} onNext={() => setScreen('input-cards')} />}
        {screen === 'input-cards' && <CardsB hand={hand} setHand={setHand} onNext={() => setScreen('input-actions')} onBack={() => setScreen('input-position')} />}
        {screen === 'input-actions' && <ActionsB onNext={() => setScreen('analysis')} onBack={() => setScreen('input-cards')} />}
        {screen === 'analysis' && <AnalysisB onBack={() => setScreen('input-actions')} onLeaks={() => setScreen('leaks')} />}
        {screen === 'leaks' && <LeaksB onBack={() => setScreen('analysis')} />}
      </div>
    </div>
  );
}

function TopBarB({ screen }) {
  const steps = ['Position', 'Cards', 'Action', 'Analysis'];
  const curIdx = { 'input-position':0,'input-cards':1,'input-actions':2,'analysis':3,'leaks':3 }[screen];

  return (
    <div style={{
      padding: '52px 24px 16px',
      borderBottom: `1px dashed ${B.inkLine}`,
      flexShrink: 0, position: 'relative', zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontFamily: B.hand, fontSize: 22, lineHeight: 1, color: B.ink, whiteSpace: 'nowrap' }}>
          Coach's Journal
        </div>
        <div style={{ fontFamily: B.mono, fontSize: 10, color: B.inkFaint }}>
          {screen === 'leaks' ? 'No. 20' : `No. ${DEMO_HAND.id.split('-').pop()}`}
        </div>
      </div>
      {screen !== 'leaks' && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <div style={{ width: 12, height: 1, background: B.inkLine }} />}
              <div style={{
                fontFamily: B.hand, fontSize: 16,
                color: i === curIdx ? B.red : (i < curIdx ? B.ink : B.inkFaint),
                textDecoration: i === curIdx ? 'underline' : 'none',
                textDecorationStyle: 'wavy',
                textUnderlineOffset: 3,
              }}>{s}</div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Position ──────────────────────────────────────────────────
function PositionB({ hand, setHand, onNext }) {
  // UTG at top, proceeding clockwise around a 6-max table
  const seats = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  const cx = 170, cy = 170, r = 115;
  return (
    <div style={{ padding: '24px 24px 140px' }}>
      <div style={{ fontFamily: B.hand, fontSize: 32, lineHeight: 1.1, marginBottom: 4 }}>
        Where did you sit?
      </div>
      <div style={{ fontSize: 14, color: B.inkSoft, fontStyle: 'italic', marginBottom: 24 }}>
        6-max · $0.50 / $1 · 100bb effective
      </div>

      <div style={{ position: 'relative', width: 340, height: 340, margin: '0 auto' }}>
        {/* Hand-drawn ring */}
        <svg width="340" height="340" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <ellipse cx={cx} cy={cy} rx={r + 12} ry={r + 8}
            fill="none" stroke={B.ink} strokeWidth="1.5"
            strokeDasharray="none" opacity="0.35" />
          <ellipse cx={cx} cy={cy} rx={r + 16} ry={r + 12}
            fill="none" stroke={B.ink} strokeWidth="0.8"
            opacity="0.2" />
        </svg>
        <div style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          fontFamily: B.hand, fontSize: 18, color: B.inkSoft, textAlign: 'center',
          pointerEvents: 'none', lineHeight: 1.1,
        }}>
          <div>$0.50 / $1</div>
          <div style={{ fontSize: 12, fontFamily: B.serif, fontStyle: 'italic', marginTop: 1 }}>six-max</div>
        </div>

        {seats.map((pos, i) => {
          const a = (-Math.PI / 2) + (i * 2 * Math.PI / seats.length);
          const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
          const sel = hand.position === pos;
          return (
            <button key={pos} onClick={() => setHand({ ...hand, position: pos })}
              style={{
                position: 'absolute', left: x - 32, top: y - 32,
                width: 64, height: 64, borderRadius: '50%',
                background: sel ? B.ink : B.paperDark,
                border: `${sel ? 2.5 : 1.5}px solid ${B.ink}`,
                color: sel ? B.paper : B.ink,
                fontFamily: B.serif, fontSize: 15, fontWeight: 600,
                cursor: 'pointer', letterSpacing: 0.3,
                boxShadow: sel ? '2px 2px 0 rgba(43,34,26,0.3)' : 'none',
                transition: 'all 0.18s',
              }}>{pos}</button>
          );
        })}
      </div>

      {hand.position && (
        <div style={{
          marginTop: 20, textAlign: 'center',
          fontFamily: B.hand, fontSize: 22, color: B.red,
        }}>
          ✓ {hand.position}
        </div>
      )}

      <BottomBarB disabled={!hand.position} onNext={onNext} label="Continue →" />
    </div>
  );
}

// ── Cards ─────────────────────────────────────────────────────
function CardsB({ hand, setHand, onNext, onBack }) {
  const [slot, setSlot] = React.useState(hand.cards.length);
  const [pickRank, setPickRank] = React.useState(null);
  const ranks = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
  const suits = [{ s: 's', g: '♠' },{ s: 'h', g: '♥' },{ s: 'd', g: '♦' },{ s: 'c', g: '♣' }];
  const isRed = s => s === 'h' || s === 'd';

  const setCard = (card) => {
    const next = [...hand.cards]; next[slot] = card;
    setHand({ ...hand, cards: next });
    setPickRank(null);
    if (slot === 0) setSlot(1);
  };

  return (
    <div style={{ padding: '24px 24px 140px' }}>
      <div style={{ fontFamily: B.hand, fontSize: 32, lineHeight: 1.1, marginBottom: 4 }}>
        Your hole cards
      </div>
      <div style={{ fontSize: 14, color: B.inkSoft, fontStyle: 'italic', marginBottom: 24 }}>
        Tap to deal — suits matter.
      </div>

      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginBottom: 28 }}>
        {[0, 1].map(i => {
          const card = hand.cards[i];
          const active = slot === i;
          return (
            <button key={i} onClick={() => { setSlot(i); setPickRank(null); }}
              style={{
                width: 92, height: 128,
                background: card ? 'transparent' : B.paperDark,
                border: `${active ? 2 : 1.5}px ${card ? 'solid' : 'dashed'} ${active ? B.red : B.ink}`,
                borderRadius: 3, cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: i === 0 ? 'rotate(-1.2deg)' : 'rotate(0.8deg)',
                boxShadow: active ? '2px 3px 0 rgba(164,49,40,0.2)' : 'none',
              }}>
              {card ? (
                <PlayingCard card={card} variant="paper" size={72} hole />
              ) : (
                <div style={{ fontFamily: B.hand, fontSize: 14, color: B.inkFaint }}>
                  card {i + 1}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {!pickRank ? (
        <>
          <div style={{ fontFamily: B.hand, fontSize: 18, color: B.inkSoft, marginBottom: 10 }}>
            ① Pick a rank
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {ranks.map(r => (
              <button key={r} onClick={() => setPickRank(r)}
                style={{
                  height: 46, border: `1.5px solid ${B.ink}`,
                  background: 'transparent', color: B.ink,
                  borderRadius: 3, fontFamily: B.serif, fontSize: 18, fontWeight: 600,
                  cursor: 'pointer',
                }}>{r}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontFamily: B.hand, fontSize: 18, color: B.inkSoft, marginBottom: 10 }}>
            ② Suit for <span style={{ color: B.red }}>{pickRank}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {suits.map(({ s, g }) => (
              <button key={s} onClick={() => setCard(pickRank + s)}
                style={{
                  height: 76, border: `1.5px solid ${B.ink}`,
                  background: 'transparent', color: isRed(s) ? B.red : B.ink,
                  borderRadius: 3, fontSize: 36, cursor: 'pointer',
                }}>{g}</button>
            ))}
          </div>
          <button onClick={() => setPickRank(null)} style={{
            marginTop: 14, background: 'none', border: 'none',
            color: B.inkSoft, fontFamily: B.hand, fontSize: 16,
            cursor: 'pointer', padding: 0, fontStyle: 'italic',
          }}>← pick another</button>
        </>
      )}

      <BottomBarB
        disabled={hand.cards.length !== 2 || hand.cards.some(c => !c)}
        onBack={onBack} onNext={onNext} label="Continue →" />
    </div>
  );
}

// ── Actions ───────────────────────────────────────────────────
function ActionsB({ onNext, onBack }) {
  const streets = [
    { name: 'Preflop', board: null, actions: DEMO_HAND.preflop, pot: 23 },
    { name: 'Flop', board: DEMO_HAND.flop.board, actions: DEMO_HAND.flop.actions, pot: DEMO_HAND.flop.pot },
    { name: 'Turn', board: DEMO_HAND.turn.board, actions: DEMO_HAND.turn.actions, pot: DEMO_HAND.turn.pot },
  ];

  return (
    <div style={{ padding: '24px 0 140px' }}>
      <div style={{ padding: '0 24px', marginBottom: 16 }}>
        <div style={{ fontFamily: B.hand, fontSize: 32, lineHeight: 1.1, marginBottom: 4 }}>
          Walk the hand
        </div>
        <div style={{ fontSize: 14, color: B.inkSoft, fontStyle: 'italic' }}>
          Pre-filled for demo — street by street.
        </div>
      </div>

      {streets.map((street, i) => (
        <div key={street.name} style={{
          padding: '18px 24px',
          borderTop: `1px dashed ${B.inkLine}`,
          background: i === 2 ? 'rgba(164,49,40,0.04)' : 'transparent',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <div style={{ fontFamily: B.hand, fontSize: 24, color: B.ink }}>{street.name}</div>
            <div style={{ fontFamily: B.mono, fontSize: 11, color: B.inkSoft }}>pot ${street.pot.toFixed(0)}</div>
          </div>
          {street.board && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              {street.board.map((c, k) => <PlayingCard key={k} card={c} variant="paper" size={36} />)}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {street.actions.map((a, k) => <ActionRowB key={k} action={a} critical={a.critical} />)}
          </div>
        </div>
      ))}

      <BottomBarB onBack={onBack} onNext={onNext} label="Analyze →" />
    </div>
  );
}

function ActionRowB({ action, critical }) {
  const isHero = action.hero;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '5px 0', borderBottom: `1px dotted ${B.inkLine}`,
      position: 'relative',
    }}>
      <PosBadge pos={action.pos} active={isHero} variant="paper" />
      <div style={{
        flex: 1, fontSize: 14, color: B.ink,
        textTransform: 'capitalize',
        textDecoration: critical ? 'underline wavy ' + B.red : 'none',
        textUnderlineOffset: 3,
      }}>
        {action.action}
        {action.size != null && (
          <span style={{ fontFamily: B.mono, color: B.inkSoft, marginLeft: 6, fontSize: 12 }}>
            ${action.size}
          </span>
        )}
      </div>
      {isHero && <span style={{ fontFamily: B.hand, fontSize: 16, color: B.red }}>me</span>}
      {critical && (
        <span style={{
          fontFamily: B.hand, fontSize: 14, color: B.red,
          transform: 'rotate(-3deg)', marginLeft: 2,
        }}>★{critical}</span>
      )}
    </div>
  );
}

// ── Analysis ──────────────────────────────────────────────────
function AnalysisB({ onBack, onLeaks }) {
  return (
    <div style={{ padding: '24px 24px 140px' }}>
      {/* Header handwritten note */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: B.hand, fontSize: 28, lineHeight: 1.15, color: B.ink, marginBottom: 6 }}>
          Two moments to revisit.
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: B.inkSoft, fontStyle: 'italic' }}>
          One's the cause, one's the consequence — work it like that.
        </div>
      </div>

      {/* Tape */}
      <div style={{
        padding: '12px 14px', marginBottom: 20,
        background: B.paperDark,
        border: `1px solid ${B.inkLine}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {DEMO_HAND.hero.cards.map((c, i) => <PlayingCard key={i} card={c} variant="paper" size={28} />)}
        </div>
        <div style={{ fontFamily: B.hand, fontSize: 18, color: B.inkSoft }}>on</div>
        <div style={{ display: 'flex', gap: 2 }}>
          {DEMO_HAND.turn.board.map((c, i) => <PlayingCard key={i} card={c} variant="paper" size={24} />)}
        </div>
        <div style={{ marginLeft: 'auto', fontFamily: B.hand, fontSize: 15, color: B.red }}>
          −$20
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {DECISIONS.map((d, i) => <DecisionCardB key={d.id} d={d} idx={i + 1} />)}
      </div>

      <button onClick={onLeaks} style={{
        marginTop: 22, width: '100%', padding: '16px',
        background: 'transparent',
        border: `1.5px dashed ${B.ink}`,
        cursor: 'pointer', color: B.ink, textAlign: 'left',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: B.hand, fontSize: 20, marginBottom: 2 }}>Open leak report</div>
          <div style={{ fontSize: 12, color: B.inkSoft, fontStyle: 'italic' }}>patterns across your last 20 hands</div>
        </div>
        <div style={{ fontFamily: B.hand, fontSize: 22, color: B.red }}>→</div>
      </button>

      <BottomBarB onBack={onBack} hideNext />
    </div>
  );
}

function DecisionCardB({ d, idx }) {
  const verdictMap = {
    problem: { color: B.red, word: '有问题' },
    acceptable: { color: B.amber, word: '可接受' },
    good: { color: B.green, word: '好' },
  };
  const v = verdictMap[d.verdict];

  return (
    <div style={{
      background: '#F7EED6',
      border: `1px solid ${B.inkLine}`,
      boxShadow: '2px 3px 0 rgba(43,34,26,0.08)',
      padding: 18,
      transform: idx === 1 ? 'rotate(-0.4deg)' : 'rotate(0.3deg)',
      position: 'relative',
    }}>
      {/* Stamp-like verdict */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        padding: '4px 10px', border: `2px solid ${v.color}`,
        color: v.color, fontFamily: B.hand, fontSize: 16,
        transform: 'rotate(3deg)', letterSpacing: 1,
      }}>{v.word}</div>

      <div style={{ fontFamily: B.mono, fontSize: 10, color: B.inkFaint, letterSpacing: 1, marginBottom: 4 }}>
        DECISION {idx} — {d.street.toUpperCase()}
      </div>
      <div style={{ fontFamily: B.hand, fontSize: 20, color: B.ink, marginBottom: 8, marginRight: 80, lineHeight: 1.15 }}>
        {d.action}
      </div>
      <div style={{
        fontSize: 15, lineHeight: 1.55,
        color: B.ink, marginBottom: 16,
        background: `linear-gradient(180deg, transparent 60%, rgba(184,117,26,0.25) 60%)`,
        display: 'inline',
      }}>
        {d.headline}
      </div>

      {d.verdict !== 'good' && (
        <div style={{ marginTop: 18, marginBottom: 18, padding: '10px 14px', background: B.paperDark, borderLeft: `3px solid ${B.green}` }}>
          <div style={{ fontFamily: B.hand, fontSize: 16, color: B.green, marginBottom: 2 }}>
            Better line
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{d.better}</div>
        </div>
      )}

      <div style={{ fontFamily: B.hand, fontSize: 18, color: B.red, marginBottom: 10 }}>
        Coach's read —
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {d.reasoning.map((r, i) => (
          <div key={i} style={{ fontSize: 14, lineHeight: 1.65, color: B.ink, display: 'flex', gap: 10 }}>
            <span style={{ fontFamily: B.hand, fontSize: 18, color: B.amber, lineHeight: 1, paddingTop: 2 }}>{i + 1}.</span>
            <div>{r}</div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 16, padding: '12px 14px',
        borderTop: `1px dashed ${B.inkLine}`,
        borderBottom: `1px dashed ${B.inkLine}`,
      }}>
        <div style={{ fontFamily: B.hand, fontSize: 15, color: B.inkSoft, marginBottom: 2 }}>
          principle
        </div>
        <div style={{ fontSize: 14, fontStyle: 'italic', color: B.ink, lineHeight: 1.5 }}>
          "{d.principle}"
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {d.tags.map(t => (
          <span key={t} style={{
            fontFamily: B.hand, fontSize: 13, color: B.red,
            padding: '1px 8px', border: `1px solid ${B.red}`,
            borderRadius: 10, transform: `rotate(${Math.random() * 2 - 1}deg)`,
            display: 'inline-block',
          }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

// ── Leaks ─────────────────────────────────────────────────────
function LeaksB({ onBack }) {
  return (
    <div style={{ padding: '24px 24px 140px' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: B.mono, fontSize: 11, color: B.inkFaint, letterSpacing: 1, marginBottom: 8 }}>
          LAST 20 HANDS · AGGREGATE READ
        </div>
        <div style={{ fontFamily: B.hand, fontSize: 32, lineHeight: 1.1, marginBottom: 10, color: B.ink }}>
          Three leaks to work on.
        </div>
        <div style={{ fontSize: 14, color: B.inkSoft, lineHeight: 1.5, fontStyle: 'italic' }}>
          Plug <span style={{ color: B.red, fontWeight: 600 }}>L1</span> first — it's the one bleeding the most bb/100.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {LEAKS.map((l, i) => <LeakCardB key={l.id} leak={l} idx={i + 1} />)}
      </div>

      {/* Signature */}
      <div style={{
        marginTop: 28, paddingTop: 18,
        borderTop: `1px dashed ${B.inkLine}`,
        fontFamily: B.hand, fontSize: 22, color: B.ink,
        textAlign: 'right', lineHeight: 1.2,
      }}>
        — Coach
        <div style={{ fontSize: 13, color: B.inkSoft, fontStyle: 'italic' }}>
          see you at the table.
        </div>
      </div>

      <BottomBarB onBack={onBack} hideNext />
    </div>
  );
}

function LeakCardB({ leak, idx }) {
  const sevColor = { high: B.red, medium: B.amber, low: B.inkSoft }[leak.severity];
  const rot = [(-0.4), (0.3), (-0.2)][idx - 1] || 0;

  return (
    <div style={{
      padding: 18, background: '#F7EED6',
      border: `1px solid ${B.inkLine}`,
      boxShadow: '2px 3px 0 rgba(43,34,26,0.08)',
      transform: `rotate(${rot}deg)`,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{
          fontFamily: B.hand, fontSize: 32,
          color: sevColor, lineHeight: 1,
          minWidth: 40,
        }}>L{idx}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>
            {leak.title}
          </div>
          <div style={{ fontFamily: B.mono, fontSize: 11, color: B.inkSoft }}>
            {leak.pattern}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 16, marginBottom: 14, paddingBottom: 12,
        borderBottom: `1px dashed ${B.inkLine}`,
      }}>
        <div>
          <div style={{ fontFamily: B.hand, fontSize: 14, color: B.inkSoft, marginBottom: -2 }}>freq</div>
          <div style={{ fontSize: 13 }}>{leak.frequency}</div>
        </div>
        <div>
          <div style={{ fontFamily: B.hand, fontSize: 14, color: B.inkSoft, marginBottom: -2 }}>cost</div>
          <div style={{ fontSize: 13, color: sevColor, fontWeight: 600 }}>{leak.cost}</div>
        </div>
      </div>

      <div style={{ fontSize: 14, lineHeight: 1.6, color: B.ink, marginBottom: 14 }}>
        {leak.diagnosis}
      </div>

      <div style={{
        padding: '12px 14px',
        background: 'rgba(79,107,58,0.12)',
        borderLeft: `3px solid ${B.green}`,
      }}>
        <div style={{ fontFamily: B.hand, fontSize: 16, color: B.green, marginBottom: 2 }}>
          Prescription
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>{leak.prescription}</div>
      </div>
    </div>
  );
}

function BottomBarB({ onBack, onNext, disabled, label, hideNext }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '14px 20px 28px',
      background: `linear-gradient(to top, ${B.paper} 55%, rgba(240,229,204,0))`,
      display: 'flex', gap: 10,
    }}>
      {onBack && (
        <button onClick={onBack} style={{
          padding: '0 18px', height: 46,
          background: 'transparent', border: `1.5px solid ${B.ink}`,
          cursor: 'pointer', color: B.ink, fontFamily: B.hand, fontSize: 18,
        }}>← back</button>
      )}
      {!hideNext && (
        <button onClick={onNext} disabled={disabled} style={{
          flex: 1, height: 46,
          background: disabled ? B.paperDark : B.ink,
          color: disabled ? B.inkFaint : B.paper,
          border: `1.5px solid ${B.ink}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: B.hand, fontSize: 22,
          boxShadow: disabled ? 'none' : '2px 2px 0 rgba(43,34,26,0.25)',
        }}>{label}</button>
      )}
    </div>
  );
}

Object.assign(window, { AppB });
