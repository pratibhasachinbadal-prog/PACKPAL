import { useEffect, useState } from 'react'
import {
  BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate,
  useParams, useSearchParams,
} from 'react-router-dom'
import {
  Bell, Bookmark, CalendarDays, Check, ChevronRight, CloudRain, CloudSun, Compass,
  Download, Grid2X2, Luggage, LogOut, MapPin, Menu, Pencil, Plus, Search, Settings,
  SlidersHorizontal, Sparkles, Trash2, User, X,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api, weatherForCity } from './services/api'
import { productCatalogue } from './data/products'
import './index.css'
import './pages.css'

const fallbackImage = '/images/destinations/alps.jpg'
const weatherLabels = {
  0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow',
  75: 'Heavy snow', 80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
}
const destinations = [
  { name: 'Paris', country: 'France', description: 'Art, cafes and timeless city walks.', image: '/images/destinations/paris.jpg', theme: 'City escape' },
  { name: 'Dubai', country: 'United Arab Emirates', description: 'Desert sunsets and modern landmarks.', image: '/images/destinations/dubai.jpg', theme: 'Desert city' },
  { name: 'Kyoto', country: 'Japan', description: 'Temple paths, gardens and local cuisine.', image: '/images/destinations/japan.jpg', theme: 'Culture' },
  { name: 'Tropical Islands', country: 'Worldwide', description: 'Warm shores and a slower pace.', image: '/images/destinations/tropical.jpg', theme: 'Beach' },
  { name: 'Alpine Escape', country: 'Europe', description: 'Fresh air, mountain trails and lakes.', image: '/images/destinations/alps.jpg', theme: 'Mountains' },
]

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('packpal_user') || sessionStorage.getItem('packpal_user') || '{}')
  } catch {
    return {}
  }
}

function saveAuth(data, remember = true) {
  const primary = remember ? localStorage : sessionStorage
  const secondary = remember ? sessionStorage : localStorage
  primary.setItem('packpal_token', data.token)
  primary.setItem('packpal_user', JSON.stringify(data.user))
  secondary.removeItem('packpal_token')
  secondary.removeItem('packpal_user')
}

function saveUser(user) {
  const storage = localStorage.getItem('packpal_token') ? localStorage : sessionStorage
  storage.setItem('packpal_user', JSON.stringify(user))
}

function destinationImage(name = '') {
  const value = name.toLowerCase()
  if (value.includes('paris') || value.includes('france')) return '/images/destinations/paris.jpg'
  if (value.includes('dubai') || value.includes('uae')) return '/images/destinations/dubai.jpg'
  if (value.includes('japan') || value.includes('kyoto') || value.includes('tokyo')) return '/images/destinations/japan.jpg'
  if (value.includes('beach') || value.includes('island') || value.includes('bali')) return '/images/destinations/tropical.jpg'
  if (value.includes('mountain') || value.includes('alpine') || value.includes('trek')) return '/images/destinations/alps.jpg'
  return fallbackImage
}

function TravelImage({ src, alt, className = '' }) {
  return <img src={src || fallbackImage} alt={alt} className={className} loading="lazy" onError={event => { event.currentTarget.src = fallbackImage }} />
}

function Logo({ compact = false }) {
  return <img src={compact ? '/logo/packpal-icon.svg' : '/logo/packpal-logo.svg'} alt="PackPal" className="logo" />
}

function Protected({ children }) {
  return localStorage.getItem('packpal_token') || sessionStorage.getItem('packpal_token')
    ? children
    : <Navigate to="/login" replace />
}

function AuthShell({ children, registration = false }) {
  return (
    <main className={`auth-page ${registration ? 'register-bg' : 'login-bg'}`}>
      <div className="auth-overlay" />
      <section className="auth-brand"><Logo /><p>Pack Smart. Travel Easy.</p></section>
      {children}
    </main>
  )
}

function AuthPage({ mode }) {
  const isLogin = mode === 'login'
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', terms: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const update = event => setForm(current => ({
    ...current,
    [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
  }))

  const submit = async event => {
    event.preventDefault()
    setError('')
    if (!isLogin) {
      if (!form.name.trim()) return setError('Please enter your full name.')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('Please enter a valid email address.')
      if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))
        return setError('Use at least 8 characters with a letter and a number.')
      if (form.password !== form.confirm) return setError('Passwords do not match.')
      if (!form.terms) return setError('Please accept the terms and conditions.')
    }

    setLoading(true)
    try {
      const data = isLogin
        ? await api.login({ email: form.email, password: form.password })
        : await api.register({ name: form.name, email: form.email, password: form.password })
      saveAuth(data, isLogin ? remember : true)
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell registration={!isLogin}>
      <form className="glass auth-card" onSubmit={submit}>
        <div className="auth-heading">
          <span>{isLogin ? 'Welcome back' : 'Start your journey'}</span>
          <h1>{isLogin ? 'Good to see you.' : 'Create your account.'}</h1>
        </div>
        {!isLogin && <label>Full name<input name="name" value={form.name} onChange={update} placeholder="Alex Morgan" autoComplete="name" required /></label>}
        <label>Email address<input name="email" type="email" value={form.email} onChange={update} placeholder="alex@example.com" autoComplete="email" required /></label>
        <label>Password
          <div className="password-field">
            <input name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={update} placeholder="At least 8 characters" autoComplete={isLogin ? 'current-password' : 'new-password'} required />
            <button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button>
          </div>
        </label>
        {!isLogin && <label>Confirm password
          <div className="password-field">
            <input name="confirm" type={showPassword ? 'text' : 'password'} value={form.confirm} onChange={update} placeholder="Repeat password" autoComplete="new-password" required />
            <button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button>
          </div>
        </label>}
        {isLogin
          ? <div className="form-row"><label className="check"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /> Remember me</label><Link className="link-button" to="/forgot-password">Forgot password?</Link></div>
          : <label className="check"><input name="terms" type="checkbox" checked={form.terms} onChange={update} /> I agree to the Terms &amp; Privacy Policy</label>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary-button" disabled={loading}>{loading ? 'Please wait...' : isLogin ? 'Login securely' : 'Create account'} <ChevronRight size={18} /></button>
        <p className="auth-switch">{isLogin ? 'New to PackPal?' : 'Already registered?'} <Link to={isLogin ? '/register' : '/login'}>{isLogin ? 'Create an account' : 'Login'}</Link></p>
      </form>
    </AuthShell>
  )
}

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async event => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const response = await api.requestPasswordReset(email)
      setMessage(response.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <AuthShell>
      <form className="glass auth-card" onSubmit={submit}>
        <div className="auth-heading"><span>ACCOUNT RECOVERY</span><h1>Forgot password?</h1></div>
        <p className="muted-copy">Enter your account email and we’ll send a secure reset link if password recovery is configured.</p>
        <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        {message && <div className="form-success" role="status">{message}</div>}
        <button className="primary-button" disabled={loading}>{loading ? 'Sending...' : 'Send reset link'} <ChevronRight size={18} /></button>
        <p className="auth-switch"><Link to="/login">Back to login</Link></p>
      </form>
    </AuthShell>
  )
}

function ResetPassword() {
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const submit = async event => {
    event.preventDefault()
    setError('')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    try {
      const response = await api.resetPassword(params.get('token'), password)
      setMessage(response.message)
      window.setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <AuthShell>
      <form className="glass auth-card" onSubmit={submit}>
        <div className="auth-heading"><span>ACCOUNT RECOVERY</span><h1>Choose a new password.</h1></div>
        <label>New password<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} required minLength={8} /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        {message && <div className="form-success" role="status">{message}</div>}
        <button className="primary-button" disabled={loading}>{loading ? 'Updating...' : 'Reset password'} <ChevronRight size={18} /></button>
      </form>
    </AuthShell>
  )
}

const navItems = [
  ['Dashboard', '/dashboard', Grid2X2],
  ['My Trips', '/trips', CalendarDays],
  ['Create New Trip', '/trips/new', Plus],
  ['Packing Lists', '/packing', Luggage],
  ['Smart Packing Assistant', '/assistant', Sparkles],
  ['Weather', '/weather', CloudSun],
  ['Saved Lists', '/saved-lists', Bookmark],
  ['Travel Destinations', '/destinations', Compass],
  ['Profile', '/profile', User],
  ['Settings', '/settings', Settings],
]

function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const user = getUser()
  const routeBackground = location.pathname === '/trips/new'
    ? 'trip-create'
    : location.pathname.startsWith('/trips/edit/')
      ? 'trips'
      : ({
          '/dashboard': 'dashboard',
          '/trips': 'trips',
          '/packing': 'packing',
          '/assistant': 'assistant',
          '/weather': 'weather',
          '/saved-lists': 'saved-lists',
          '/destinations': 'destinations',
          '/profile': 'profile',
          '/settings': 'settings',
        }[location.pathname] || 'profile')
  const logout = () => {
    localStorage.removeItem('packpal_token')
    localStorage.removeItem('packpal_user')
    sessionStorage.removeItem('packpal_token')
    sessionStorage.removeItem('packpal_user')
    navigate('/login', { replace: true })
  }
  const submitSearch = event => {
    event.preventDefault()
    navigate(`/trips?query=${encodeURIComponent(query.trim())}`)
    setOpen(false)
  }
  return (
    <div className="app-shell">
      {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-top"><Logo /><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setOpen(false)}><X /></button></div>
        <nav>{navItems.map(([label, to, Icon]) =>
          <NavLink key={to} to={to} end={to === '/trips'} onClick={() => setOpen(false)}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
        <button className="logout" onClick={logout}><LogOut size={18} /> Logout</button>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu /></button>
          <form className="search-box topbar-search" onSubmit={submitSearch}><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search trips..." aria-label="Search trips" /></form>
          <div className="topbar-actions">
            <div className="popover-anchor">
              <button className="icon-button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen(value => !value); setProfileOpen(false) }}><Bell /></button>
              {notificationsOpen && <div className="topbar-popover"><strong>Notifications</strong><p>You’re all caught up.</p><Link to="/trips" onClick={() => setNotificationsOpen(false)}>Review your trips</Link></div>}
            </div>
            <div className="popover-anchor">
              <button className="avatar" aria-label="Open profile menu" aria-expanded={profileOpen} onClick={() => { setProfileOpen(value => !value); setNotificationsOpen(false) }}>{user.name?.[0]?.toUpperCase() || 'P'}</button>
              {profileOpen && <div className="topbar-popover profile-popover"><strong>{user.name || 'PackPal traveller'}</strong><span>{user.email || ''}</span><Link to="/profile" onClick={() => setProfileOpen(false)}>Profile</Link><Link to="/settings" onClick={() => setProfileOpen(false)}>Settings</Link><button onClick={logout}>Logout</button></div>}
            </div>
          </div>
        </header>
        <main className={`page-content page-content--${routeBackground}`}>{children}</main>
      </section>
    </div>
  )
}

function useTrips() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      setTrips(await api.trips())
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { reload() }, [])
  return { trips, setTrips, loading, error, reload }
}

function PageHeading({ eyebrow, title, action }) {
  return <div className="page-heading"><div><span>{eyebrow}</span><h1>{title}</h1></div>{action}</div>
}

function Empty({ title, text, action, label = 'Get started' }) {
  return <div className="empty-state"><Luggage /><h3>{title}</h3><p>{text}</p>{action && <button className="secondary-button" onClick={action}>{label}</button>}</div>
}

function DashboardWeather({ city }) {
  const [weather, setWeather] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setWeather(null)
    setError('')
    if (!city) return undefined
    weatherForCity(city).then(data => { if (active) setWeather(data) }).catch(requestError => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [city])
  return (
    <section className="panel glass weather-preview">
      <span>LIVE WEATHER</span><h2>{city || 'Your destination'}</h2>
      {weather && <div className="weather-now"><CloudSun size={42} /><strong>{Math.round(weather.current.temperature_2m)}°</strong><div><b>{weatherLabels[weather.current.weather_code] || 'Current conditions'}</b><p>H:{Math.round(weather.daily.temperature_2m_max[0])}° L:{Math.round(weather.daily.temperature_2m_min[0])}°</p></div></div>}
      {!city && <p className="muted-copy">Create a trip to see a live forecast for its destination.</p>}
      {city && !weather && !error && <p className="muted-copy">Loading live forecast...</p>}
      {error && <p className="muted-copy">{error}</p>}
      <Link to="/weather" className="text-link">Open weather <ChevronRight size={16} /></Link>
    </section>
  )
}

function Dashboard() {
  const { trips, loading, error } = useTrips()
  const user = getUser()
  const navigate = useNavigate()
  const nextTrip = trips.filter(trip => trip.departureDate >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.departureDate.localeCompare(b.departureDate))[0]
  const allItems = trips.flatMap(trip => trip.packing || [])
  const packedItems = allItems.filter(item => item.packed)
  const weight = packedItems.reduce((sum, item) => sum + (Number(item.weight) || 0) * (Number(item.quantity) || 1), 0)
  const progress = allItems.length ? Math.round(packedItems.length / allItems.length * 100) : 0
  const previewItems = allItems.slice(0, 5)
  return (
    <Layout>
      <section className="welcome-card glass">
        <div><span className="eyebrow">WELCOME BACK</span><h1>Pack beautifully, <em>{user.name?.split(' ')[0] || 'traveller'}.</em></h1><p>Your next adventure is already taking shape.</p><button className="primary-button" onClick={() => navigate('/trips/new')}><Plus size={18} /> Create New Trip</button></div>
        <TravelImage src="/images/dashboard/travel.jpg" alt="Scenic travel destination" className="welcome-image" />
      </section>
      <section className="stats-grid">
        {[
          ['Total trips', trips.length, Luggage],
          ['Packing progress', `${progress}%`, SlidersHorizontal],
          ['Baggage weight', `${weight.toFixed(1)} kg`, Luggage],
          ['Upcoming trips', trips.filter(trip => trip.departureDate >= new Date().toISOString().slice(0, 10)).length, CalendarDays],
        ].map(([label, value, Icon]) => <article className="stat-card glass" key={label}><div className="stat-icon"><Icon /></div><div><span>{label}</span><strong>{loading ? '...' : value}</strong></div></article>)}
      </section>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="dashboard-grid">
        <section className="panel glass">
          <div className="panel-heading"><div><span>RECENT TRIPS</span><h2>My adventures</h2></div><Link to="/trips">View all <ChevronRight size={16} /></Link></div>
          {trips.length ? trips.slice(0, 3).map(trip => <article className="trip-row" key={trip.id}><TravelImage src={destinationImage(trip.destination)} alt={trip.destination} /><div><h3>{trip.destination}</h3><p>{trip.departureDate} – {trip.returnDate}</p></div><ChevronRight /></article>)
            : <Empty title={loading ? 'Loading your trips' : 'No trips yet'} text={loading ? 'Your saved journeys will appear here.' : 'Create your first journey to get started.'} action={loading ? undefined : () => navigate('/trips/new')} />}
        </section>
        <DashboardWeather city={nextTrip?.destination} />
        <section className="panel glass"><div className="panel-heading"><div><span>QUICK ACTIONS</span><h2>Plan faster</h2></div></div><div className="quick-actions"><button onClick={() => navigate('/trips/new')}><Plus />New trip</button><button onClick={() => navigate('/packing')}><Luggage />Packing list</button><button onClick={() => navigate('/assistant')}><Sparkles />Smart pack</button></div></section>
        <section className="panel glass packing-preview">
          <div className="panel-heading"><div><span>PACKING LIST PREVIEW</span><h2>{nextTrip?.destination || 'Your next trip'}</h2></div><Link to="/packing">Open list <ChevronRight size={16} /></Link></div>
          {previewItems.length ? <><div className="preview-progress"><span>{packedItems.length} of {allItems.length} items packed</span><div className="progress"><i style={{ width: `${progress}%` }} /></div></div>{previewItems.map(item => <div className="preview-item" key={item.id}><span className={item.packed ? 'preview-check done' : 'preview-check'}>{item.packed ? <Check size={14} /> : null}</span><span>{item.name}</span><small>{item.quantity} ×</small></div>)}</>
            : <Empty title="Your list is ready to build" text="Generate trip-specific packing suggestions." action={() => navigate('/assistant')} label="Open Smart Assistant" />}
        </section>
        <section className="inspiration panel"><span>TRAVEL INSPIRATION</span><h2>Where will you go next?</h2><div className="destination-cards">{destinations.slice(0, 3).map(place => <Link key={place.name} to="/destinations" state={{ destination: place.name }}><TravelImage src={place.image} alt={place.name} /><b>{place.name}</b></Link>)}</div></section>
      </div>
    </Layout>
  )
}

function Trips() {
  const { trips, setTrips, loading, error } = useTrips()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const query = searchParams.get('query')?.toLowerCase() || ''
  const visibleTrips = trips.filter(trip => `${trip.destination} ${trip.purpose} ${(trip.activities || []).join(' ')}`.toLowerCase().includes(query))
  const [actionError, setActionError] = useState('')
  const remove = async id => {
    if (!window.confirm('Delete this trip and its packing list?')) return
    setActionError('')
    try {
      await api.deleteTrip(id)
      setTrips(current => current.filter(trip => String(trip.id) !== String(id)))
    } catch (requestError) {
      setActionError(requestError.message)
    }
  }
  return (
    <Layout>
      <PageHeading eyebrow="MY JOURNEY" title="My Trips" action={<button className="primary-button" onClick={() => navigate('/trips/new')}><Plus /> New trip</button>} />
      {(error || actionError) && <div className="form-error" role="alert">{error || actionError}</div>}
      {loading ? <div className="panel glass loading">Loading trips...</div> : visibleTrips.length
        ? <div className="trip-grid">{visibleTrips.map(trip => <article className="trip-card glass" key={trip.id}><TravelImage src={destinationImage(trip.destination)} alt={trip.destination} /><div className="trip-card-body"><span>{trip.purpose || 'Leisure'}</span><h2>{trip.destination}</h2><p>{trip.departureDate} → {trip.returnDate}</p><p>{trip.travellers || 1} traveller{trip.travellers === 1 ? '' : 's'} · {(trip.activities || []).join(', ') || 'No activities selected'}</p><div className="trip-actions"><button onClick={() => navigate(`/trips/edit/${trip.id}`)}>Edit</button><button onClick={() => navigate(`/packing?trip=${trip.id}`)}>Packing list</button><button onClick={() => remove(trip.id)} aria-label={`Delete ${trip.destination} trip`}><Trash2 size={16} /></button></div></div></article>)}</div>
        : <div className="panel glass"><Empty title={query ? 'No matching trips' : 'No adventures planned'} text={query ? 'Try another destination or search term.' : 'Your saved trips will appear here.'} action={query ? undefined : () => navigate('/trips/new')} label="Create a trip" /></div>}
    </Layout>
  )
}

function TripForm() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    destination: location.state?.destination || '', departureDate: '', returnDate: '', travellers: 1,
    purpose: 'Leisure', activities: [], baggageType: 'Checked', packing: [],
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(Boolean(id))
  useEffect(() => {
    if (!id) return
    api.trips().then(trips => {
      const trip = trips.find(item => String(item.id) === String(id))
      if (!trip) throw new Error('Trip not found.')
      setForm({ ...trip, travellers: trip.travellers || 1, activities: trip.activities || [], packing: trip.packing || [] })
    }).catch(requestError => setError(requestError.message)).finally(() => setLoading(false))
  }, [id])
  const duration = form.departureDate && form.returnDate
    ? Math.max(0, Math.ceil((new Date(form.returnDate) - new Date(form.departureDate)) / 86400000) + 1)
    : 0
  const activities = ['Beach', 'Mountain Trekking', 'Business Conference', 'Wedding', 'Sightseeing', 'Adventure', 'Family Vacation', 'Camping']
  const toggleActivity = value => setForm(current => ({
    ...current,
    activities: current.activities.includes(value) ? current.activities.filter(item => item !== value) : [...current.activities, value],
  }))
  const submit = async event => {
    event.preventDefault()
    setError('')
    if (new Date(form.returnDate) < new Date(form.departureDate)) return setError('Return date must be on or after departure.')
    try {
      if (id) await api.updateTrip(id, form)
      else await api.createTrip(form)
      navigate('/trips')
    } catch (requestError) {
      setError(requestError.message)
    }
  }
  return (
    <Layout>
      <PageHeading eyebrow="NEW ADVENTURE" title={id ? 'Edit Trip' : 'Create New Trip'} />
      {loading ? <div className="panel glass loading">Loading trip...</div> : <form className="trip-form glass" onSubmit={submit}>
        <div className="form-grid">
          <label>Destination<input value={form.destination} onChange={event => setForm({ ...form, destination: event.target.value })} placeholder="e.g. Kyoto, Japan" required /></label>
          <label>Trip purpose<select value={form.purpose} onChange={event => setForm({ ...form, purpose: event.target.value })}><option>Leisure</option><option>Business</option><option>Family</option><option>Wedding</option><option>Adventure</option></select></label>
          <label>Departure date<input type="date" value={form.departureDate} onChange={event => setForm({ ...form, departureDate: event.target.value })} required /></label>
          <label>Return date<input type="date" value={form.returnDate} onChange={event => setForm({ ...form, returnDate: event.target.value })} required /></label>
          <label>Number of travellers<input type="number" min="1" max="20" value={form.travellers} onChange={event => setForm({ ...form, travellers: Number(event.target.value) })} required /></label>
          <label>Baggage type<select value={form.baggageType} onChange={event => setForm({ ...form, baggageType: event.target.value })}><option>Checked</option><option>Cabin</option><option>Both</option></select></label>
        </div>
        <div className="activity-section"><span>Activities</span><div className="activity-grid">{activities.map(activity => <button type="button" className={form.activities.includes(activity) ? 'active' : ''} onClick={() => toggleActivity(activity)} key={activity}>{activity}</button>)}</div></div>
        {duration > 0 && <div className="duration"><CalendarDays /><div><span>Trip duration</span><strong>{duration} day{duration === 1 ? '' : 's'}</strong></div></div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={() => navigate('/trips')}>Cancel</button><button className="primary-button" type="submit">{id ? 'Save changes' : 'Save trip'}</button></div>
      </form>}
    </Layout>
  )
}

function Packing() {
  const { trips, setTrips, loading, error } = useTrips()
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [category, setCategory] = useState('All')
  const [baggage, setBaggage] = useState('All')
  const [search, setSearch] = useState('')
  const [customName, setCustomName] = useState('')
  const [actionError, setActionError] = useState('')
  const [saved, setSaved] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [editError, setEditError] = useState('')
  const tripId = params.get('trip') || ''
  const trip = trips.find(item => String(item.id) === tripId) || trips[0]
  useEffect(() => {
    if (!trip) return
    if (String(params.get('trip')) !== String(trip.id)) setParams({ trip: String(trip.id) }, { replace: true })
    setItems(trip.packing || [])
    setSaved(true)
  }, [trip?.id])
  const updateItems = updater => {
    setItems(current => typeof updater === 'function' ? updater(current) : updater)
    setSaved(false)
  }
  const packedCount = items.filter(item => item.packed).length
  const remainingCount = items.length - packedCount
  const progress = items.length ? Math.round(packedCount / items.length * 100) : 0
  const weight = items.reduce((total, item) => total + (Number(item.weight) || 0) * (Number(item.quantity) || 1), 0)
  const categoryOptions = [...new Set([
    ...productCatalogue.map(item => item.category),
    ...items.map(item => item.category).filter(Boolean),
    'Custom',
  ])]
  const filtered = items.filter(item =>
    (category === 'All' || item.category === category) &&
    (baggage === 'All' || item.baggage === baggage) &&
    item.name.toLowerCase().includes(search.toLowerCase()),
  )
  const save = async () => {
    if (!trip) return
    setActionError('')
    try {
      const updated = await api.updateTrip(trip.id, { ...trip, packing: items })
      setTrips(current => current.map(item => String(item.id) === String(updated.id) ? updated : item))
      setSaved(true)
    } catch (requestError) {
      setActionError(requestError.message)
    }
  }
  const addCustom = () => {
    const name = customName.trim()
    if (!name) {
      setActionError('Enter a name for the custom item.')
      return
    }
    setActionError('')
    updateItems(items => [...items, {
      id: `custom-${crypto.randomUUID()}`, name, category: 'Custom', quantity: 1, weight: 0.2,
      packed: false, baggage: 'Checked', image: fallbackImage,
    }])
    setCustomName('')
  }
  const beginEdit = item => {
    setEditingId(item.id)
    setEditDraft({ name: item.name, category: item.category, quantity: item.quantity, weight: item.weight })
    setEditError('')
  }
  const saveItemEdit = id => {
    const name = editDraft?.name.trim()
    if (!editDraft) return
    if (!name) {
      setEditError('Enter an item name before saving.')
      return
    }
    updateItems(current => current.map(item => item.id === id ? {
      ...item,
      name,
      category: editDraft.category,
      quantity: Math.max(1, Number(editDraft.quantity) || 1),
      weight: Math.max(0, Number(editDraft.weight) || 0),
    } : item))
    setEditingId(null)
    setEditDraft(null)
    setEditError('')
  }
  const exportPdf = () => {
    const doc = new jsPDF()
    doc.setFontSize(20)
    doc.text(`PackPal · ${trip?.destination || 'Packing List'}`, 14, 18)
    doc.setFontSize(10)
    doc.text(`Progress: ${progress}%  |  Estimated weight: ${weight.toFixed(1)} kg`, 14, 26)
    autoTable(doc, {
      startY: 32, head: [['Item', 'Category', 'Baggage', 'Qty', 'Weight', 'Packed']],
      body: items.map(item => [item.name, item.category, item.baggage, item.quantity, `${(item.weight * item.quantity).toFixed(2)} kg`, item.packed ? 'Yes' : 'No']),
    })
    doc.save('PackPal-Packing-List.pdf')
  }
  return (
    <Layout>
      <PageHeading eyebrow="TRIP INVENTORY" title="Packing Lists" action={<div className="heading-actions"><button className="secondary-button" onClick={exportPdf} disabled={!items.length}><Download size={17} /> Export PDF</button><button className="primary-button" onClick={save} disabled={!trip || saved}>{saved ? <Check size={17} /> : null}{saved ? 'Saved' : 'Save changes'}</button></div>} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      {loading ? <div className="panel glass loading">Loading trips...</div> : !trips.length
        ? <div className="panel glass"><Empty title="Create a trip first" text="Your packing list is stored with a trip so it stays private and available across devices." action={() => window.location.assign('/trips/new')} label="Create a trip" /></div>
        : <>
          <div className="packing-tools glass">
            <label className="trip-picker">Trip<select value={trip ? String(trip.id) : ''} onChange={event => setParams({ trip: event.target.value })}>{trips.map(item => <option key={item.id} value={item.id}>{item.destination}</option>)}</select></label>
            <div className="search-box"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search items..." /></div>
            <select value={category} onChange={event => setCategory(event.target.value)} aria-label="Filter by category">{['All', ...categoryOptions].map(value => <option key={value}>{value}</option>)}</select>
            <select value={baggage} onChange={event => setBaggage(event.target.value)} aria-label="Filter by baggage">{['All', 'Cabin', 'Checked'].map(value => <option key={value}>{value}</option>)}</select>
            <div className="custom-add"><input value={customName} onChange={event => setCustomName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCustom() } }} placeholder="Add custom item" /><button onClick={addCustom} aria-label="Add custom item"><Plus /></button></div>
          </div>
          <div className="packing-summary">
            <div><span>Total Items</span><strong>{items.length}</strong></div>
            <div><span>Packed Items</span><strong>{packedCount}</strong></div>
            <div><span>Remaining Items</span><strong>{remainingCount}</strong></div>
            <div><span>Packing Progress</span><strong>{progress}%</strong><div className="progress"><i style={{ width: `${progress}%` }} /></div></div>
            <div><span>Total Luggage Weight</span><strong>{weight.toFixed(2)} kg</strong></div>
          </div>
          <div className="packing-subnav"><span>{trip.destination}</span><Link to={`/assistant?trip=${trip.id}`}>Generate smart suggestions <Sparkles size={16} /></Link><span>{items.length} items</span></div>
          {filtered.length ? <div className="product-grid">{filtered.map(item => <article className={`product-card glass ${item.packed ? 'packed' : ''}`} key={item.id}>
            <div className="product-image"><TravelImage src={item.image} alt={item.name} /><label className="product-pack-toggle" title={item.packed ? 'Packed' : 'Not packed'}><input type="checkbox" checked={Boolean(item.packed)} onChange={() => updateItems(current => current.map(value => value.id === item.id ? { ...value, packed: !value.packed } : value))} aria-label={`${item.name} packed`} /><span>{item.packed ? <Check size={14} /> : null}</span></label></div>
            <div className="product-info">
              <span>{item.category}</span>
              <h3>{item.name}</h3>
              {editingId === item.id && editDraft
                ? <div className="product-edit-form">
                    <label>Name<input value={editDraft.name} onChange={event => setEditDraft({ ...editDraft, name: event.target.value })} /></label>
                    <label>Category<select value={editDraft.category} onChange={event => setEditDraft({ ...editDraft, category: event.target.value })}>{categoryOptions.map(value => <option key={value}>{value}</option>)}</select></label>
                    <label>Quantity<input type="number" min="1" max="99" value={editDraft.quantity} onChange={event => setEditDraft({ ...editDraft, quantity: event.target.value })} /></label>
                    <label>Weight (kg)<input type="number" min="0" step="0.01" value={editDraft.weight} onChange={event => setEditDraft({ ...editDraft, weight: event.target.value })} /></label>
                    {editError && <span className="form-error product-edit-error" role="alert">{editError}</span>}
                    <div className="product-edit-actions"><button onClick={() => saveItemEdit(item.id)}>Save item</button><button onClick={() => { setEditingId(null); setEditDraft(null) }}>Cancel</button></div>
                  </div>
                : <div className="product-controls">
                    <strong>{(item.weight * item.quantity).toFixed(2)} kg total</strong>
                    <span>Qty {item.quantity}</span>
                    <span className="packed-state">{item.packed ? 'Packed' : 'Not packed'}</span>
                    <select aria-label={`${item.name} baggage`} value={item.baggage} onChange={event => updateItems(current => current.map(value => value.id === item.id ? { ...value, baggage: event.target.value } : value))}><option>Cabin</option><option>Checked</option></select>
                    <button className="delete-item" onClick={() => beginEdit(item)} aria-label={`Edit ${item.name}`}><Pencil size={14} /></button>
                    <button className="delete-item" onClick={() => updateItems(current => current.filter(value => value.id !== item.id))} aria-label={`Delete ${item.name}`}><Trash2 size={15} /></button>
                  </div>}
            </div>
          </article>)}</div> : <div className="panel glass"><Empty title={items.length ? 'No matching items' : 'Your packing list is empty'} text={items.length ? 'Adjust the search or filters.' : 'Generate a personalised list with the Smart Packing Assistant.'} action={items.length ? undefined : () => window.location.assign(`/assistant?trip=${trip.id}`)} label="Generate list" /></div>}
        </>}
    </Layout>
  )
}

function makeSuggestions(trip, weather) {
  const days = Math.max(1, Math.ceil((new Date(trip.returnDate) - new Date(trip.departureDate)) / 86400000) + 1)
  const travellers = Math.max(1, Number(trip.travellers) || 1)
  const activities = (trip.activities || []).join(' ').toLowerCase()
  const picked = new Map()
  const aliases = {
    'phone charger': 'Phone Charger',
    underwear: 'Innerwear',
    'walking shoes': 'Comfortable Shoes',
    'reusable water bottle': 'Water Bottle',
    daypack: 'Travel Backpack',
    'hiking trousers': 'Trousers',
    'rain jacket': 'Jacket',
    'waterproof shoes': 'Comfortable Shoes',
    'formal shirt': 'Shirts',
    'light jacket': 'Jacket',
    swimsuit: 'Shorts',
    'flip-flops': 'Comfortable Shoes',
  }
  const add = (name, quantity = 1) => {
    const searchName = aliases[name.toLowerCase()] || name
    const item = productCatalogue.find(product => product.name.toLowerCase() === searchName.toLowerCase())
    const suggestion = item || {
      id: `suggestion-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      category: 'Custom',
      weight: 0.1,
      image: fallbackImage,
    }
    picked.set(suggestion.id, { ...suggestion, quantity: quantity * travellers, packed: false, baggage: trip.baggageType === 'Cabin' ? 'Cabin' : 'Checked' })
  }
  ;['Passport', 'Travel insurance', 'Phone charger', 'Toothbrush', 'Toothpaste', 'Underwear', 'Socks', 'T-shirts', 'Walking shoes'].forEach(name => add(name, name === 'Underwear' || name === 'Socks' || name === 'T-shirts' ? Math.min(days, 7) : 1))
  if (activities.includes('beach')) ['Swimsuit', 'Sunscreen', 'Flip-flops', 'Reusable water bottle'].forEach(name => add(name, name === 'Swimsuit' ? 2 : 1))
  if (activities.includes('mountain') || activities.includes('trek') || activities.includes('camping')) ['Hiking trousers', 'Thermal base layer', 'Rain jacket', 'Waterproof shoes', 'Insect repellent', 'Emergency whistle'].forEach(name => add(name))
  if (activities.includes('business') || trip.purpose?.toLowerCase() === 'business') ['Formal shirt', 'Laptop', 'Laptop charger', 'Notebook', 'Pen'].forEach(name => add(name, name === 'Formal shirt' ? 2 : 1))
  if (activities.includes('wedding')) ['Formal shirt', 'Dress shoes', 'Belt'].forEach(name => add(name))
  if (activities.includes('sightseeing')) ['Daypack', 'Sunglasses', 'Power bank', 'Reusable water bottle'].forEach(name => add(name))
  const temperature = weather?.current?.temperature_2m
  if (Number.isFinite(temperature) && temperature < 16) ['Light jacket', 'Sweater', 'Scarf'].forEach(name => add(name))
  if (Number.isFinite(temperature) && temperature > 24) ['Sunscreen', 'Hat', 'Reusable water bottle'].forEach(name => add(name))
  if (weather?.daily?.precipitation_probability_max?.[0] >= 40) ['Umbrella', 'Rain jacket'].forEach(name => add(name))
  return [...picked.values()]
}

function SmartAssistant() {
  const { trips, setTrips, loading, error } = useTrips()
  const [params, setParams] = useSearchParams()
  const tripId = params.get('trip')
  const trip = trips.find(item => String(item.id) === String(tripId)) || trips[0]
  const [weather, setWeather] = useState(null)
  const [weatherError, setWeatherError] = useState('')
  const [items, setItems] = useState([])
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!trip) return
    if (!tripId) setParams({ trip: String(trip.id) }, { replace: true })
    let active = true
    setWeather(null)
    setWeatherError('')
    weatherForCity(trip.destination).then(value => { if (active) setWeather(value) }).catch(requestError => { if (active) setWeatherError(requestError.message) })
    return () => { active = false }
  }, [trip?.id])
  const generate = () => {
    if (!trip) return
    setItems(makeSuggestions(trip, weather))
    setSaved(false)
    setMessage('')
  }
  const save = async () => {
    if (!trip) return
    try {
      const packing = [...(trip.packing || [])]
      for (const suggestion of items) {
        const existingIndex = packing.findIndex(item => item.name.toLowerCase() === suggestion.name.toLowerCase())
        if (existingIndex < 0) packing.push(suggestion)
        else packing[existingIndex] = {
          ...packing[existingIndex],
          quantity: Math.max(Number(packing[existingIndex].quantity) || 1, Number(suggestion.quantity) || 1),
        }
      }
      const updated = await api.updateTrip(trip.id, { ...trip, packing })
      setTrips(current => current.map(value => String(value.id) === String(updated.id) ? updated : value))
      setSaved(true)
      setMessage('Your personalised list is saved to this trip.')
    } catch (requestError) {
      setMessage(requestError.message)
    }
  }
  return (
    <Layout>
      <PageHeading eyebrow="TRIP-SPECIFIC PLANNING" title="Smart Packing Assistant" />
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading ? <div className="panel glass loading">Loading your trips...</div> : !trips.length
        ? <div className="panel glass"><Empty title="Start with a trip" text="The assistant uses your destination, travel dates and activities to build suggestions." action={() => window.location.assign('/trips/new')} label="Create a trip" /></div>
        : <section className="assistant-layout">
          <div className="panel glass assistant-controls">
            <label>Choose a trip<select value={trip ? String(trip.id) : ''} onChange={event => setParams({ trip: event.target.value })}>{trips.map(item => <option key={item.id} value={item.id}>{item.destination} · {item.departureDate}</option>)}</select></label>
            <div className="assistant-trip-image"><TravelImage src={destinationImage(trip.destination)} alt={trip.destination} /><div><span>YOUR TRIP</span><h2>{trip.destination}</h2><p>{trip.departureDate} → {trip.returnDate} · {trip.travellers || 1} traveller(s)</p></div></div>
            <div className="assistant-weather"><CloudSun /><div><span>Live destination weather</span><strong>{weather ? `${Math.round(weather.current.temperature_2m)}° · ${weatherLabels[weather.current.weather_code] || 'Current conditions'}` : weatherError || 'Loading forecast...'}</strong></div></div>
            <p className="muted-copy">Suggestions use trip duration, travellers, activities and the live forecast when available.</p>
            <button className="primary-button" onClick={generate}><Sparkles size={18} /> Generate packing list</button>
            {items.length > 0 && <button className="secondary-button" onClick={save} disabled={saved}>{saved ? <Check size={17} /> : null}{saved ? 'Saved to trip' : 'Save to trip'}</button>}
            {message && <div className={saved ? 'form-success' : 'form-error'} role="status">{message}</div>}
          </div>
          <div className="panel glass assistant-results"><div className="panel-heading"><div><span>PERSONALISED CHECKLIST</span><h2>{items.length ? `${items.length} suggested items` : 'Ready when you are'}</h2></div><Link to={`/packing?trip=${trip.id}`}>Open packing list <ChevronRight size={16} /></Link></div>
            {items.length ? <div className="suggestion-list">{items.map(item => <div className="suggestion-item" key={item.id}><span className="preview-check"><Check size={14} /></span><div><strong>{item.name}</strong><small>{item.category} · {item.baggage}</small></div><b>{item.quantity} ×</b></div>)}</div> : <Empty title="Generate a tailored list" text="The list will adapt to your trip details and available live weather." />}
          </div>
        </section>}
    </Layout>
  )
}

function SavedLists() {
  const { trips, setTrips } = useTrips()
  const [lists, setLists] = useState([])
  const [tripId, setTripId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = async () => {
    setLoading(true)
    try { setLists(await api.savedLists()); setError('') }
    catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { if (!tripId && trips.length) setTripId(String(trips[0].id)) }, [trips, tripId])
  const saveTripList = async () => {
    const trip = trips.find(item => String(item.id) === tripId)
    if (!trip?.packing?.length) return setError('Choose a trip with a packing list first.')
    try {
      await api.createSavedList({ name: `${trip.destination} packing list`, items: trip.packing })
      await load()
    } catch (requestError) { setError(requestError.message) }
  }
  const deleteList = async id => {
    if (!window.confirm('Delete this saved list?')) return
    try { await api.deleteSavedList(id); setLists(current => current.filter(item => String(item.id) !== String(id))) }
    catch (requestError) { setError(requestError.message) }
  }
  const renameList = async list => {
    const name = window.prompt('Name this saved list', list.name)
    if (!name?.trim() || name.trim() === list.name) return
    try {
      const updated = await api.updateSavedList(list.id, { name: name.trim(), items: list.items || [] })
      setLists(current => current.map(item => String(item.id) === String(updated.id) ? updated : item))
    } catch (requestError) { setError(requestError.message) }
  }
  const applyList = async list => {
    const trip = trips.find(item => String(item.id) === tripId)
    if (!trip) return setError('Create a trip before loading a packing template.')
    try {
      const updated = await api.updateTrip(trip.id, { ...trip, packing: list.items || [] })
      setTrips(current => current.map(item => String(item.id) === String(updated.id) ? updated : item))
      setError('')
    } catch (requestError) { setError(requestError.message) }
  }
  return (
    <Layout>
      <PageHeading eyebrow="YOUR TEMPLATES" title="Saved Lists" action={<div className="heading-actions"><select value={tripId} onChange={event => setTripId(event.target.value)} aria-label="Select trip">{trips.map(trip => <option key={trip.id} value={trip.id}>{trip.destination}</option>)}</select><button className="primary-button" onClick={saveTripList} disabled={!trips.length}><Bookmark size={17} /> Save trip list</button></div>} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading ? <div className="panel glass loading">Loading saved lists...</div> : lists.length
        ? <div className="saved-list-grid">{lists.map(list => <article className="panel glass saved-list-card" key={list.id}><div className="saved-list-icon"><Bookmark /></div><div><span>{(list.items || []).length} items</span><h2>{list.name}</h2><p>{list.updated_at ? new Date(list.updated_at).toLocaleDateString() : 'Saved packing template'}</p></div><div className="trip-actions"><button onClick={() => applyList(list)}>Load into trip</button><button onClick={() => renameList(list)}>Rename</button><button onClick={() => deleteList(list.id)} aria-label={`Delete ${list.name}`}><Trash2 size={16} /></button></div></article>)}</div>
        : <div className="panel glass"><Empty title="No saved lists yet" text="Save a trip packing list here to reuse it later." action={saveTripList} label="Save current trip list" /></div>}
    </Layout>
  )
}

function Destinations() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const visible = destinations.filter(place => `${place.name} ${place.country} ${place.theme}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <Layout>
      <PageHeading eyebrow="FIND YOUR NEXT ADVENTURE" title="Travel Destinations" />
      <div className="destination-search search-box"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by destination or travel style..." aria-label="Search destinations" /></div>
      {visible.length ? <div className="destination-grid">{visible.map(place => <article className="destination-card glass" key={place.name}><TravelImage src={place.image} alt={`${place.name}, ${place.country}`} /><div className="destination-card-body"><span>{place.theme} · {place.country}</span><h2>{place.name}</h2><p>{place.description}</p><button className="secondary-button" onClick={() => navigate('/trips/new', { state: { destination: place.name === 'Tropical Islands' || place.name === 'Alpine Escape' ? place.name : `${place.name}, ${place.country}` } })}><MapPin size={16} /> Plan this trip</button></div></article>)}</div>
        : <div className="panel glass"><Empty title="No destinations found" text="Try another search." /></div>}
    </Layout>
  )
}

function Weather() {
  const { trips, loading: tripsLoading } = useTrips()
  const [city, setCity] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialised, setInitialised] = useState(false)
  useEffect(() => {
    if (initialised || tripsLoading) return
    const initialCity = trips[0]?.destination || 'Paris'
    setCity(initialCity)
    setInitialised(true)
    setLoading(true)
    weatherForCity(initialCity).then(setData).catch(requestError => setError(requestError.message)).finally(() => setLoading(false))
  }, [trips, tripsLoading, initialised])
  const search = async event => {
    event.preventDefault()
    if (!city.trim()) return setError('Enter a city or destination.')
    setLoading(true)
    setError('')
    try { setData(await weatherForCity(city.trim())) }
    catch (requestError) { setData(null); setError(requestError.message) }
    finally { setLoading(false) }
  }
  return (
    <Layout>
      <PageHeading eyebrow="LIVE OPEN-METEO FORECAST" title="Weather" />
      <form className="weather-search glass" onSubmit={search}><Search size={18} /><input value={city} onChange={event => setCity(event.target.value)} placeholder="Search city or destination" aria-label="Weather location" /><button className="primary-button" disabled={loading}>{loading ? 'Searching...' : 'Search'}</button></form>
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading ? <div className="panel glass loading">Loading live weather...</div> : data && <div className="weather-layout">
        <section className="weather-hero glass"><span>{data.place.name}, {data.place.country}</span><CloudSun /><strong>{Math.round(data.current.temperature_2m)}°</strong><h2>{weatherLabels[data.current.weather_code] || 'Current conditions'}</h2><div className="weather-details"><span>Feels like <b>{Math.round(data.current.apparent_temperature)}°</b></span><span>Humidity <b>{data.current.relative_humidity_2m}%</b></span><span>Wind <b>{Math.round(data.current.wind_speed_10m)} km/h</b></span><span>Rain now <b>{data.current.rain} mm</b></span></div></section>
        <section className="forecast panel glass"><h2>7-day forecast</h2>{data.daily.time.map((day, index) => <div key={day}><span>{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span><b>{weatherLabels[data.daily.weather_code[index]] || '—'}</b><span className="rain-chance"><CloudRain size={15} /> {data.daily.precipitation_probability_max[index] ?? '—'}%</span><strong>{Math.round(data.daily.temperature_2m_max[index])}° <small>{Math.round(data.daily.temperature_2m_min[index])}°</small></strong></div>)}</section>
      </div>}
    </Layout>
  )
}

function Profile() {
  const [form, setForm] = useState({ name: '', email: '' })
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.profile().then(user => setForm({ name: user.name, email: user.email })).catch(requestError => setError(requestError.message)).finally(() => setLoading(false))
  }, [])
  const saveProfile = async event => {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      const user = await api.updateProfile(form)
      saveUser(user)
      setMessage('Profile updated.')
    } catch (requestError) { setError(requestError.message) }
  }
  const changePassword = async event => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (passwords.newPassword !== passwords.confirm) return setError('New passwords do not match.')
    try {
      const response = await api.changePassword(passwords)
      setMessage(response.message)
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' })
    } catch (requestError) { setError(requestError.message) }
  }
  return (
    <Layout>
      <PageHeading eyebrow="YOUR ACCOUNT" title="Profile" />
      {loading ? <div className="panel glass loading">Loading profile...</div> : <div className="profile-grid">
        <form className="panel glass form-panel" onSubmit={saveProfile}><div className="panel-heading"><div><span>PERSONAL DETAILS</span><h2>Profile information</h2></div></div><label>Full name<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label><label>Email address<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /></label><button className="primary-button">Save profile</button></form>
        <form className="panel glass form-panel" onSubmit={changePassword}><div className="panel-heading"><div><span>SECURITY</span><h2>Change password</h2></div></div><label>Current password<input type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={event => setPasswords({ ...passwords, currentPassword: event.target.value })} required /></label><label>New password<input type="password" autoComplete="new-password" value={passwords.newPassword} onChange={event => setPasswords({ ...passwords, newPassword: event.target.value })} minLength={8} required /></label><label>Confirm new password<input type="password" autoComplete="new-password" value={passwords.confirm} onChange={event => setPasswords({ ...passwords, confirm: event.target.value })} minLength={8} required /></label><button className="primary-button">Update password</button></form>
      </div>}
      {error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success" role="status">{message}</div>}
    </Layout>
  )
}

function SettingsPage() {
  const [settings, setSettings] = useState({ cabinBaggageLimit: 7, checkedBaggageLimit: 23, temperatureUnit: 'C', notifications: true })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.settings().then(setSettings).catch(requestError => setError(requestError.message)).finally(() => setLoading(false)) }, [])
  const save = async event => {
    event.preventDefault()
    setError('')
    setMessage('')
    try { setSettings(await api.updateSettings(settings)); setMessage('Preferences saved to your account.') }
    catch (requestError) { setError(requestError.message) }
  }
  return (
    <Layout>
      <PageHeading eyebrow="PERSONALISE PACKPAL" title="Settings" />
      {loading ? <div className="panel glass loading">Loading preferences...</div> : <form className="panel glass settings-form" onSubmit={save}>
        <div className="panel-heading"><div><span>TRAVEL PREFERENCES</span><h2>Baggage &amp; display</h2></div></div>
        <div className="form-grid"><label>Cabin baggage limit (kg)<input type="number" min="1" max="30" value={settings.cabinBaggageLimit} onChange={event => setSettings({ ...settings, cabinBaggageLimit: Number(event.target.value) })} required /></label><label>Checked baggage limit (kg)<input type="number" min="1" max="60" value={settings.checkedBaggageLimit} onChange={event => setSettings({ ...settings, checkedBaggageLimit: Number(event.target.value) })} required /></label><label>Temperature unit<select value={settings.temperatureUnit} onChange={event => setSettings({ ...settings, temperatureUnit: event.target.value })}><option value="C">Celsius</option><option value="F">Fahrenheit</option></select></label></div>
        <label className="check settings-check"><input type="checkbox" checked={settings.notifications} onChange={event => setSettings({ ...settings, notifications: event.target.checked })} /> Enable PackPal notifications</label>
        <button className="primary-button">Save settings</button>
      </form>}
      {error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success" role="status">{message}</div>}
    </Layout>
  )
}

function NotFound() {
  return <Layout><div className="panel glass"><Empty title="Page not found" text="The page may have moved. Use the sidebar to continue." action={() => window.location.assign('/dashboard')} label="Go to dashboard" /></div></Layout>
}

export default function App() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
    <Route path="/trips" element={<Protected><Trips /></Protected>} />
    <Route path="/trips/new" element={<Protected><TripForm /></Protected>} />
    <Route path="/trips/edit/:id" element={<Protected><TripForm /></Protected>} />
    <Route path="/packing" element={<Protected><Packing /></Protected>} />
    <Route path="/assistant" element={<Protected><SmartAssistant /></Protected>} />
    <Route path="/weather" element={<Protected><Weather /></Protected>} />
    <Route path="/saved-lists" element={<Protected><SavedLists /></Protected>} />
    <Route path="/destinations" element={<Protected><Destinations /></Protected>} />
    <Route path="/profile" element={<Protected><Profile /></Protected>} />
    <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
    <Route path="*" element={<Protected><NotFound /></Protected>} />
  </Routes></BrowserRouter>
}
