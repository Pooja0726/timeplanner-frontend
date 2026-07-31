import { useState, useEffect } from 'react';

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

function App() {
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

  useEffect(() => {
    fetchTodayLogs();
    const savedEmail = localStorage.getItem('paceEmail');
    if (savedEmail) {
      handleLogin(savedEmail);
    }
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
    fetch('http://localhost:8080/api/auth/login', {
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
  }

  function fetchTasks(currentProfileId) {
    if (!currentProfileId) return;
    fetch(`http://localhost:8080/api/tasks?profileId=${currentProfileId}`)
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

    fetch(`http://localhost:8080/api/tasks?profileId=${profileId}`, {
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
    fetch(`http://localhost:8080/api/tasks/${id}`, { method: 'DELETE' })
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

    fetch(`http://localhost:8080/api/profile?userId=${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProfile),
    })
      .then((response) => response.json())
      .then((data) => {
        setProfileId(data.id);
        setProfileCreated(true);
        fetchTasks(data.id);
      })
      .catch((error) => console.error('Error creating profile:', error));
  }

  function generateSchedule() {
    if (!profileId) return;
    fetch(`http://localhost:8080/api/schedule/${profileId}`)
      .then((response) => response.json())
      .then((data) => setSchedule(data))
      .catch((error) => console.error('Error generating schedule:', error));
  }

  function fetchTodayLogs() {
    fetch('http://localhost:8080/api/timelogs/today')
      .then((response) => response.json())
      .then((data) => setTodayLogs(data))
      .catch((error) => console.error('Error fetching logs:', error));
  }

  function startTimer() {
    fetch(`http://localhost:8080/api/timelogs/start?category=${selectedCategory}`, { method: 'POST' })
      .then((response) => response.json())
      .then((data) => {
        setActiveLogId(data.id);
        setTimerStartedAt(Date.now());
        setElapsedSeconds(0);
      })
      .catch((error) => console.error('Error starting timer:', error));
  }

  function stopTimer() {
    fetch(`http://localhost:8080/api/timelogs/stop/${activeLogId}`, { method: 'PUT' })
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
    fetch(`http://localhost:8080/api/timelogs/summary/${profileId}`)
      .then((response) => response.json())
      .then((data) => setSummary(data))
      .catch((error) => console.error('Error fetching summary:', error));
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