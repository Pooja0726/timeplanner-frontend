import { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

function formatMinutes(totalMinutes) {
  if (totalMinutes == null) return '';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function formatSeconds(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const CATEGORIES = ['Study', 'Eat', 'Sleep', 'Play', 'Exercise', 'Break/Idle', 'Other'];

const CATEGORY_COLORS = {
  Study: '#4C7EF3',
  Eat: '#F5A524',
  Sleep: '#8B7CF6',
  Play: '#F1487E',
  Exercise: '#2FBF8F',
  'Break/Idle': '#A9B7D0',
  Other: '#C97CE0',
};

function buildConicGradient(categoryTotals, totalDayMinutes) {
  if (!totalDayMinutes || totalDayMinutes <= 0) return '#E3EAF6';
  let cumulative = 0;
  const stops = [];
  CATEGORIES.forEach((cat) => {
    const minutes = categoryTotals[cat] || 0;
    if (minutes <= 0) return;
    const pct = (minutes / totalDayMinutes) * 100;
    const start = cumulative;
    const end = Math.min(100, cumulative + pct);
    stops.push(`${CATEGORY_COLORS[cat]} ${start}% ${end}%`);
    cumulative = end;
  });
  if (cumulative < 100) {
    stops.push(`#E3EAF6 ${cumulative}% 100%`);
  }
  if (stops.length === 0) return '#E3EAF6';
  return `conic-gradient(${stops.join(', ')})`;
}

// --- Server wake-up screen -------------------------------------------------
function ServerWakingScreen({ attempt }) {
  const message =
    attempt <= 1
      ? 'Connecting to the server…'
      : 'Waking up the server — this can take up to a minute on our free hosting plan…';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        padding: '24px',
        textAlign: 'center',
        fontFamily: 'inherit',
      }}
    >
      <style>
        {`
          @keyframes pace-spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '4px solid #E3EAF6',
          borderTopColor: '#4C7EF3',
          animation: 'pace-spin 0.9s linear infinite',
        }}
      />
      <div>
        <div style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: 6 }}>
          {message}
        </div>
        <div style={{ color: '#8A93A6', fontSize: '0.9rem', maxWidth: 360 }}>
          Our free-tier server goes to sleep when nobody's using it. It's
          starting back up now and this page will load automatically —
          no need to refresh.
        </div>
      </div>
    </div>
  );
}
// ----------------------------------------------------------------------------

function App() {
  const [serverReady, setServerReady] = useState(false);
  const [wakeAttempt, setWakeAttempt] = useState(1);

  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [showAddForm, setShowAddForm] = useState(false);

  const [schedule, setSchedule] = useState([]);
  const [profileId, setProfileId] = useState(null);

  const [wakeTime, setWakeTime] = useState('07:00');
  const [sleepTime, setSleepTime] = useState('23:00');
  const [occupation, setOccupation] = useState('College');
  const [profileCreated, setProfileCreated] = useState(false);

  const [activeTab, setActiveTab] = useState('tasks');

  const [selectedCategory, setSelectedCategory] = useState('Study');
  const [activeLogId, setActiveLogId] = useState(null);
  const [timerStartedAt, setTimerStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [todayLogs, setTodayLogs] = useState([]);
  const [summary, setSummary] = useState(null);

  const [guardEnabled, setGuardEnabled] = useState(false);
  const [guardStatus, setGuardStatus] = useState('off');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const missCountRef = useRef(0);
  const modelsLoadedRef = useRef(false);
  const audioCtxRef = useRef(null);

  // Pings the backend until it responds at all (even an error response counts
  // as "awake" — we only care about detecting a sleeping Render instance
  // here, not fetching real data, since we don't know the profileId yet).
  useEffect(() => {
    let cancelled = false;

    function pingServer(attempt) {
      fetch(`${API_BASE_URL}/api/timelogs/today?profileId=0`)
        .then(() => {
          if (cancelled) return;
          setServerReady(true);

          const savedEmail = localStorage.getItem('paceEmail');
          if (savedEmail) {
            handleLogin(savedEmail);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setWakeAttempt(attempt);
          setTimeout(() => pingServer(attempt + 1), 4000);
        });
    }

    pingServer(1);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!timerStartedAt) return;
    const intervalId = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - timerStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [timerStartedAt]);

  function handleLogin(email) {
    setLoginError('');
    fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
      .then((response) => {
        if (!response.ok) throw new Error('Login failed');
        return response.json();
      })
      .then((data) => {
        setUserId(data.userId);
        setUserEmail(data.email);
        localStorage.setItem('paceEmail', data.email);

        if (data.profileId) {
          setProfileId(data.profileId);
          setWakeTime(data.wakeTime.substring(0, 5));
          setSleepTime(data.sleepTime.substring(0, 5));
          setOccupation(data.occupation);
          setProfileCreated(true);
          fetchTasks(data.profileId);
          fetchTodayLogs(data.profileId);
        } else {
          setProfileCreated(false);
        }
      })
      .catch((error) => {
        console.error('Error logging in:', error);
        setLoginError('Something went wrong — please try again.');
      });
  }

  function handleLoginSubmit(event) {
    event.preventDefault();
    if (!emailInput.trim()) return;
    handleLogin(emailInput.trim());
  }

  function handleLogout() {
    localStorage.removeItem('paceEmail');
    setUserId(null);
    setUserEmail('');
    setEmailInput('');
    setProfileId(null);
    setProfileCreated(false);
    setTasks([]);
    setSchedule([]);
    setSummary(null);
    setTodayLogs([]);
  }

  function fetchTasks(currentProfileId) {
    if (!currentProfileId) return;
    fetch(`${API_BASE_URL}/api/tasks?profileId=${currentProfileId}`)
      .then((response) => response.json())
      .then((data) => setTasks(data))
      .catch((error) => console.error('Error fetching tasks:', error));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const newTask = {
      title: title,
      durationMinutes: parseInt(duration),
      priority: priority,
    };

    fetch(`${API_BASE_URL}/api/tasks?profileId=${profileId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask),
    })
      .then((response) => response.json())
      .then(() => {
        fetchTasks(profileId);
        setTitle('');
        setDuration('');
        setPriority('Medium');
        setShowAddForm(false);
      })
      .catch((error) => console.error('Error creating task:', error));
  }

  function deleteTask(id) {
    fetch(`${API_BASE_URL}/api/tasks/${id}`, { method: 'DELETE' })
      .then(() => fetchTasks(profileId))
      .catch((error) => console.error('Error deleting task:', error));
  }

  function handleProfileSubmit(event) {
    event.preventDefault();
    const newProfile = {
      wakeTime: wakeTime + ':00',
      sleepTime: sleepTime + ':00',
      occupation: occupation,
    };

    fetch(`${API_BASE_URL}/api/profile?userId=${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProfile),
    })
      .then((response) => response.json())
      .then((data) => {
        setProfileId(data.id);
        setProfileCreated(true);
        fetchTasks(data.id);
        fetchTodayLogs(data.id);
      })
      .catch((error) => console.error('Error creating profile:', error));
  }

  function generateSchedule() {
    if (!profileId) return;
    fetch(`${API_BASE_URL}/api/schedule/${profileId}`)
      .then((response) => response.json())
      .then((data) => setSchedule(data))
      .catch((error) => console.error('Error generating schedule:', error));
  }

  function fetchTodayLogs(currentProfileId) {
    const id = currentProfileId ?? profileId;
    if (!id) return;
    fetch(`${API_BASE_URL}/api/timelogs/today?profileId=${id}`)
      .then((response) => response.json())
      .then((data) => setTodayLogs(data))
      .catch((error) => console.error('Error fetching logs:', error));
  }

  function startTimer() {
    if (!profileId) return;
    fetch(`${API_BASE_URL}/api/timelogs/start?category=${selectedCategory}&profileId=${profileId}`, {
      method: 'POST',
    })
      .then((response) => response.json())
      .then((data) => {
        setActiveLogId(data.id);
        setTimerStartedAt(Date.now());
        setElapsedSeconds(0);
      })
      .catch((error) => console.error('Error starting timer:', error));
  }

  function stopTimer() {
    fetch(`${API_BASE_URL}/api/timelogs/stop/${activeLogId}`, { method: 'PUT' })
      .then((response) => response.json())
      .then(() => {
        setActiveLogId(null);
        setTimerStartedAt(null);
        setElapsedSeconds(0);
        fetchTodayLogs();
      })
      .catch((error) => console.error('Error stopping timer:', error));
  }

  function fetchSummary() {
    if (!profileId) return;
    fetch(`${API_BASE_URL}/api/timelogs/summary/${profileId}`)
      .then((response) => response.json())
      .then((data) => setSummary(data))
      .catch((error) => console.error('Error fetching summary:', error));
  }

  function playAlarmBeep() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
  }

  async function ensureModelsLoaded() {
    if (modelsLoadedRef.current) return;
    const MODEL_URL = '/models';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    modelsLoadedRef.current = true;
  }

  async function startFocusGuard() {
  setGuardStatus('loading');
  try {
    await ensureModelsLoaded();
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    missCountRef.current = 0;
    setGuardStatus('watching');

    // Larger inputSize + lower scoreThreshold makes detection more tolerant
    // of head tilt/angle, so normal movement doesn't register as "absent".
    const detectorOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 416,
      scoreThreshold: 0.25,
    });

    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;
      const detection = await faceapi.detectSingleFace(videoRef.current, detectorOptions);

      if (detection) {
        missCountRef.current = 0;
        setGuardStatus('watching');
      } else {
        missCountRef.current += 1;
        // Require ~16 seconds of continuous no-detection (8 misses at 2s each)
        // before alarming, so brief look-aways or head tilts don't trigger it.
        if (missCountRef.current >= 8) {
          setGuardStatus('alarm');
          playAlarmBeep();
        }
      }
    }, 2000);
  } catch (error) {
    console.error('Focus Guard camera error:', error);
    setGuardStatus('off');
    setGuardEnabled(false);
    alert('Could not access your camera. Check browser permissions and try again.');
  }
}

  function stopFocusGuard() {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    missCountRef.current = 0;
    setGuardStatus('off');
  }

  useEffect(() => {
    if (guardEnabled && activeLogId) {
      startFocusGuard();
    } else {
      stopFocusGuard();
    }
    return () => stopFocusGuard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardEnabled, activeLogId]);

  if (!serverReady) {
    return <ServerWakingScreen attempt={wakeAttempt} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-name">Pace</div>
          <div className="brand-tagline">time, mapped to your day</div>
        </div>
        {profileCreated && (
          <div className="profile-chip">
            <span>⏰ {wakeTime}–{sleepTime}</span>
            <span className="dot-sep">·</span>
            <span>{occupation}</span>
            <button className="chip-edit" onClick={() => setProfileCreated(false)}>Edit</button>
            <button className="chip-edit" onClick={handleLogout}>Log out</button>
          </div>
        )}
      </header>

      {!userId ? (
        <div className="onboarding-hero">
          <div className="onboarding-copy">
            <div className="onboarding-ring" aria-hidden="true">
              <div className="onboarding-ring-inner"></div>
            </div>
            <h1 className="onboarding-headline">Plan your day.<br />Track what actually happens.</h1>
            <p className="onboarding-lede">
              Pace turns your wake and sleep time into a real schedule, then tracks
              where your hours actually go — so studying, breaks, and everything
              in between stop being a guess.
            </p>

            <div className="feature-list">
              <div className="feature-item">
                <span className="feature-icon feature-icon-blue">◷</span>
                <div>
                  <div className="feature-title">Auto-built schedule</div>
                  <div className="feature-desc">Add tasks by priority, and Pace slots them into your free time.</div>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-icon feature-icon-pink">●</span>
                <div>
                  <div className="feature-title">Live focus timer</div>
                  <div className="feature-desc">Start and stop a real timer for study, breaks, or anything else.</div>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-icon feature-icon-mint">◐</span>
                <div>
                  <div className="feature-title">Honest daily summary</div>
                  <div className="feature-desc">See time used by category, and time that just slipped away.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card onboarding-card">
            <h2>Welcome</h2>
            <p className="card-subtext">Log in or create an account to get started.</p>
            <form onSubmit={handleLoginSubmit} className="profile-form profile-form-stacked">
              <label>
                Email address
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  required
                />
              </label>
              {loginError && <p className="card-subtext" style={{ color: 'var(--pink)' }}>{loginError}</p>}
              <button className="btn-primary btn-block" type="submit">Continue</button>
            </form>
          </div>
        </div>
      ) : !profileCreated ? (
        <div className="onboarding-hero">
          <div className="onboarding-copy">
            <div className="onboarding-ring" aria-hidden="true">
              <div className="onboarding-ring-inner"></div>
            </div>
            <h1 className="onboarding-headline">Plan your day.<br />Track what actually happens.</h1>
            <p className="onboarding-lede">
              Pace turns your wake and sleep time into a real schedule, then tracks
              where your hours actually go — so studying, breaks, and everything
              in between stop being a guess.
            </p>

            <div className="feature-list">
              <div className="feature-item">
                <span className="feature-icon feature-icon-blue">◷</span>
                <div>
                  <div className="feature-title">Auto-built schedule</div>
                  <div className="feature-desc">Add tasks by priority, and Pace slots them into your free time.</div>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-icon feature-icon-pink">●</span>
                <div>
                  <div className="feature-title">Live focus timer</div>
                  <div className="feature-desc">Start and stop a real timer for study, breaks, or anything else.</div>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-icon feature-icon-mint">◐</span>
                <div>
                  <div className="feature-title">Honest daily summary</div>
                  <div className="feature-desc">See time used by category, and time that just slipped away.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card onboarding-card">
            <h2>Set up your day</h2>
            <p className="card-subtext">Tell Pace when your day starts and ends, so it can plan around it.</p>
            <form onSubmit={handleProfileSubmit} className="profile-form profile-form-stacked">
              <label>
                Wake-up time
                <input type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} required />
              </label>
              <label>
                Sleep time
                <input type="time" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} required />
              </label>
              <label>
                I am a
                <select value={occupation} onChange={(e) => setOccupation(e.target.value)}>
                  <option value="School">School student</option>
                  <option value="College">College student</option>
                  <option value="Job">Working professional</option>
                </select>
              </label>
              <button className="btn-primary btn-block" type="submit">Save profile &amp; start planning</button>
            </form>
          </div>
        </div>
      ) : (
        <div className="dashboard-grid">
          <div className="main-col">
            <div className="tab-bar">
              <button
                className={`tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
                onClick={() => setActiveTab('tasks')}
              >
                Tasks
              </button>
              <button
                className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
                onClick={() => setActiveTab('schedule')}
              >
                Schedule
              </button>
            </div>

            {activeTab === 'tasks' && (
              <div className="card">
                <div className="card-header-row">
                  <h2>Your tasks</h2>
                  <button className="btn-secondary" onClick={() => setShowAddForm((s) => !s)}>
                    {showAddForm ? 'Cancel' : '+ Add task'}
                  </button>
                </div>

                {showAddForm && (
                  <form onSubmit={handleSubmit} className="task-form">
                    <input
                      type="text"
                      placeholder="Task title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      placeholder="Minutes"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      required
                    />
                    <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                    <button className="btn-primary" type="submit">Add</button>
                  </form>
                )}

                <div className="task-list-clean">
                  {tasks.length === 0 && <p className="empty-state">No tasks yet — add your first one above.</p>}
                  {tasks.map((task) => (
                    <div key={task.id} className="task-row">
                      <div className="task-row-left">
                        <span className={`dot dot-${task.priority}`}></span>
                        <span>{task.title}</span>
                      </div>
                      <div className="task-row-right">
                        <span className="task-meta-text">{formatMinutes(task.durationMinutes)} · {task.priority}</span>
                        <button className="btn-danger-ghost" onClick={() => deleteTask(task.id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'schedule' && (
              <div className="card">
                <div className="card-header-row">
                  <h2>Today's schedule</h2>
                  <button className="btn-primary" onClick={generateSchedule}>Generate</button>
                </div>
                {schedule.length === 0 ? (
                  <p className="empty-state">Generate a schedule to see your day mapped out.</p>
                ) : (
                  <div className="timeline">
                    {schedule.map((item, index) => (
                      <div key={index} className="timeline-item">
                        <span className={`timeline-dot dot-${item.priority}`}></span>
                        <div className="timeline-title">{item.title}</div>
                        <div className="timeline-time">
                          {item.scheduled ? `${item.startTime} – ${item.endTime}` : 'Not scheduled'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="sidebar">
            <div className="card">
              <h3>Focus timer</h3>
              <div className="timer-ring-wrap">
                <div className={`timer-ring ${activeLogId ? '' : 'idle'}`}>
                  <span className="timer-ring-value">
                    {activeLogId ? formatSeconds(elapsedSeconds) : '—'}
                  </span>
                </div>

                {!activeLogId ? (
                  <>
                    <div className="category-pills">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          className={`pill-btn ${selectedCategory === cat ? 'selected' : ''}`}
                          onClick={() => setSelectedCategory(cat)}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    <button className="btn-primary" onClick={startTimer}>Start tracking</button>
                  </>
                ) : (
                  <button className="btn-primary" onClick={stopTimer}>Stop</button>
                )}
              </div>

              <div className="today-logs">
                {todayLogs.filter((l) => l.endTime).slice(-4).reverse().map((log) => (
                  <div key={log.id} className="today-log-row">
                    <span>{log.category}</span>
                    <span>{formatMinutes(log.durationMinutes)}</span>
                  </div>
                ))}
              </div>

              <div className="guard-section">
                <div className="guard-toggle-row">
                  <div>
                    <div className="guard-title">Focus Guard</div>
                    <div className="guard-subtitle">Alerts you if you step away mid-session</div>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={guardEnabled}
                      onChange={(e) => setGuardEnabled(e.target.checked)}
                    />
                    <span className="switch-slider"></span>
                  </label>
                </div>

                {guardEnabled && !activeLogId && (
                  <p className="guard-hint">Start a focus timer to activate Focus Guard.</p>
                )}

                {guardEnabled && activeLogId && (
                  <div className={`guard-preview ${guardStatus === 'alarm' ? 'guard-alarm' : ''}`}>
                    <video ref={videoRef} autoPlay muted playsInline className="guard-video" />
                    <div className="guard-status-badge">
                      {guardStatus === 'loading' && 'Starting camera…'}
                      {guardStatus === 'watching' && '● Watching'}
                      {guardStatus === 'alarm' && '⚠ Come back!'}
                    </div>
                  </div>
                )}

                <p className="guard-privacy-note">Runs entirely in your browser — video is never uploaded or stored.</p>
              </div>
            </div>

            <div className="card">
              <div className="card-header-row">
                <h3>Daily summary</h3>
                <button className="btn-secondary" onClick={fetchSummary}>Refresh</button>
              </div>

              {summary ? (
                <>
                  <div className="donut-wrap">
                    <div
                      className="donut"
                      style={{ background: buildConicGradient(summary.categoryTotals, summary.totalDayMinutes) }}
                    >
                      <div className="donut-center">
                        <span className="value">{formatMinutes(summary.totalLoggedMinutes)}</span>
                        <span className="label">Tracked</span>
                      </div>
                    </div>
                  </div>
                  <div className="legend">
                    {Object.entries(summary.categoryTotals).map(([cat, minutes]) => (
                      <div key={cat} className="legend-item">
                        <span className="legend-dot" style={{ background: CATEGORY_COLORS[cat] || '#ccc' }}></span>
                        {cat} · {formatMinutes(minutes)}
                      </div>
                    ))}
                    <div className="legend-item">
                      <span className="legend-dot" style={{ background: '#E3EAF6' }}></span>
                      Unaccounted · {formatMinutes(summary.unaccountedMinutes)}
                    </div>
                  </div>
                </>
              ) : (
                <p className="empty-state">Tap refresh to see today's breakdown.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;