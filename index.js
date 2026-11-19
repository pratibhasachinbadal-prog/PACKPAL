import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import dotenv from 'dotenv'
import nodemailer from 'nodemailer'
import { productCatalogue } from '../src/data/products.js'

dotenv.config()
const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const PORT = process.env.PORT || 8787
const dataFile = path.resolve('data', 'packpal.json')
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false } }) : null
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'packpal-development-secret-change-me')

if (isProduction && !JWT_SECRET) throw new Error('JWT_SECRET must be configured for production.')
if (isProduction && !pool) throw new Error('DATABASE_URL must be configured for production.')

function readStore() {
  if (!fs.existsSync(dataFile)) return { users: [], trips: [], savedLists: [], settings: [], passwordResets: [] }
  const store = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
  return {
    users: [],
    trips: [],
    savedLists: [],
    settings: [],
    passwordResets: [],
    ...store,
  }
}
function writeStore(store) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true })
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2))
}

async function ensurePostgres() {
  if (!pool) return
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    destination TEXT NOT NULL, departure_date DATE, return_date DATE, travellers INTEGER,
    purpose TEXT, activities TEXT[], baggage_type TEXT, packing JSONB DEFAULT '[]'::jsonb,
    packing_template_version SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS packing_template_version SMALLINT NOT NULL DEFAULT 0')
  await pool.query(`CREATE TABLE IF NOT EXISTS saved_lists (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  )`)
  const pendingTemplates = await pool.query('SELECT EXISTS (SELECT 1 FROM trips WHERE packing_template_version < 1) AS pending')
  if (pendingTemplates.rows[0].pending) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1)', [742103927])
      const { rows } = await client.query('SELECT id,packing FROM trips WHERE packing_template_version < 1 FOR UPDATE')
      for (const trip of rows) {
        const existing = Array.isArray(trip.packing) ? trip.packing : []
        const existingNames = new Set(existing.map(item => String(item?.name || '').trim().toLowerCase()))
        const packing = [
          ...existing,
          ...productCatalogue.filter(item => !existingNames.has(item.name.toLowerCase())).map(item => ({ ...item })),
        ]
        await client.query(
          'UPDATE trips SET packing=$1::jsonb,packing_template_version=1 WHERE id=$2',
          [JSON.stringify(packing), trip.id],
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

function packingWithDefaults(packing) {
  const existing = Array.isArray(packing) ? packing : []
  const existingNames = new Set(existing.map(item => String(item?.name || '').trim().toLowerCase()))
  return [
    ...existing,
    ...productCatalogue.filter(item => !existingNames.has(item.name.toLowerCase())).map(item => ({ ...item })),
  ]
}

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Please log in again.' })
  }
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') || !password || password.length < 8)
      return res.status(400).json({ error: 'Enter a name, valid email and a password of at least 8 characters.' })
    const hash = await bcrypt.hash(password, 12)
    let user
    if (pool) {
      await ensurePostgres()
      const result = await pool.query(
        'INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING RETURNING id,name,email',
        [name.trim(), email.trim().toLowerCase(), hash]
      )
      if (!result.rows.length) return res.status(409).json({ error: 'An account with this email already exists.' })
      user = result.rows[0]
    } else {
      const store = readStore()
      if (store.users.some(u => u.email === email.trim().toLowerCase()))
        return res.status(409).json({ error: 'An account with this email already exists.' })
      user = { id: Date.now(), name: name.trim(), email: email.trim().toLowerCase(), passwordHash: hash }
      store.users.push(user)
      writeStore(store)
    }
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } })
  } catch (error) {
    res.status(500).json({ error: 'Unable to create account. Please try again.' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') || !password)
      return res.status(400).json({ error: 'Enter a valid email address and password.' })
    let user
    if (pool) {
      await ensurePostgres()
      const result = await pool.query('SELECT * FROM users WHERE email=$1', [email?.trim().toLowerCase()])
      user = result.rows[0]
    } else {
      user = readStore().users.find(u => u.email === email?.trim().toLowerCase())
    }
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' })
    const hash = user.password_hash || user.passwordHash
    if (!(await bcrypt.compare(password || '', hash))) return res.status(401).json({ error: 'Invalid email or password.' })
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } })
  } catch {
    res.status(500).json({ error: 'Unable to log in. Please try again.' })
  }
})

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = req.body.email?.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || ''))
    return res.status(400).json({ error: 'Enter a valid email address.' })
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.SMTP_FROM)
    return res.status(503).json({ error: 'Password reset email is not configured. Please contact PackPal support.' })

  try {
    await ensurePostgres()
    let user
    if (pool) {
      const result = await pool.query('SELECT id,email FROM users WHERE email=$1', [email])
      user = result.rows[0]
    } else {
      user = readStore().users.find(u => u.email === email)
    }

    if (user) {
      const token = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
      if (pool) {
        await pool.query('DELETE FROM password_resets WHERE user_id=$1', [user.id])
        await pool.query('INSERT INTO password_resets (token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [tokenHash, user.id, expiresAt])
      } else {
        const store = readStore()
        store.passwordResets = store.passwordResets.filter(reset => reset.userId !== user.id)
        store.passwordResets.push({ tokenHash, userId: user.id, expiresAt: expiresAt.toISOString() })
        writeStore(store)
      }

      const port = Number(process.env.SMTP_PORT || 587)
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      })
      const resetUrl = `${process.env.APP_URL || 'https://packpal-omega.vercel.app'}/reset-password?token=${token}`
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: 'Reset your PackPal password',
        text: `Use this link within 30 minutes to reset your PackPal password: ${resetUrl}`,
        html: `<p>Use this link within 30 minutes to reset your PackPal password:</p><p><a href="${resetUrl}">Reset password</a></p>`,
      })
    }
    res.json({ message: 'If an account exists for that email, a password reset link has been sent.' })
  } catch {
    res.status(500).json({ error: 'Unable to send a password reset email right now.' })
  }
})

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body
  if (!token || !password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    return res.status(400).json({ error: 'Use a valid reset link and a password of at least 8 characters with a letter and a number.' })
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const user = pool
      ? (await pool.query(
        'SELECT u.id FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token_hash=$1 AND r.expires_at>NOW()',
        [tokenHash],
      )).rows[0]
      : (() => {
        const store = readStore()
        const reset = store.passwordResets.find(item => item.tokenHash === tokenHash && new Date(item.expiresAt) > new Date())
        return reset && store.users.find(item => item.id === reset.userId)
      })()
    if (!user) return res.status(400).json({ error: 'This password reset link is invalid or expired.' })

    const passwordHash = await bcrypt.hash(password, 12)
    if (pool) {
      await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [passwordHash, user.id])
      await pool.query('DELETE FROM password_resets WHERE user_id=$1', [user.id])
    } else {
      const store = readStore()
      const account = store.users.find(item => item.id === user.id)
      account.passwordHash = passwordHash
      store.passwordResets = store.passwordResets.filter(item => item.userId !== user.id)
      writeStore(store)
    }
    res.json({ message: 'Password updated. You can now log in.' })
  } catch {
    res.status(500).json({ error: 'Unable to reset your password right now.' })
  }
})

app.get('/api/trips', auth, async (req, res) => {
  if (pool) {
    await ensurePostgres()
    const result = await pool.query('SELECT * FROM trips WHERE user_id=$1 ORDER BY departure_date DESC NULLS LAST', [req.user.id])
    return res.json(result.rows)
  }
  res.json(readStore().trips.filter(t => t.userId === req.user.id))
})

app.post('/api/trips', auth, async (req, res) => {
  const { destination, departureDate, returnDate, travellers, purpose, activities, baggageType, packing } = req.body
  if (!destination || !departureDate || !returnDate || new Date(returnDate) < new Date(departureDate))
    return res.status(400).json({ error: 'Provide a destination and valid travel dates.' })
  const initialPacking = packingWithDefaults(packing)
  if (pool) {
    await ensurePostgres()
    const result = await pool.query(
      `INSERT INTO trips (user_id,destination,departure_date,return_date,travellers,purpose,activities,baggage_type,packing,packing_template_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1) RETURNING *`,
      [req.user.id, destination, departureDate, returnDate, travellers || 1, purpose, activities || [], baggageType || 'Checked', JSON.stringify(initialPacking)]
    )
    return res.status(201).json(result.rows[0])
  }
  const store = readStore()
  const trip = { id: Date.now(), userId: req.user.id, destination, departureDate, returnDate, travellers: travellers || 1, purpose, activities: activities || [], baggageType: baggageType || 'Checked', packing: initialPacking }
  store.trips.push(trip)
  writeStore(store)
  res.status(201).json(trip)
})

app.put('/api/trips/:id', auth, async (req, res) => {
  const id = req.params.id
  if (pool) {
    await ensurePostgres()
    const result = await pool.query(
      `UPDATE trips SET destination=$1,departure_date=$2,return_date=$3,travellers=$4,purpose=$5,
       activities=$6,baggage_type=$7,packing=$8 WHERE id=$9 AND user_id=$10 RETURNING *`,
      [req.body.destination, req.body.departureDate, req.body.returnDate, req.body.travellers, req.body.purpose,
       req.body.activities || [], req.body.baggageType, JSON.stringify(req.body.packing || []), id, req.user.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Trip not found.' })
    return res.json(result.rows[0])
  }
  const store = readStore()
  const index = store.trips.findIndex(t => String(t.id) === String(id) && t.userId === req.user.id)
  if (index < 0) return res.status(404).json({ error: 'Trip not found.' })
  store.trips[index] = { ...store.trips[index], ...req.body }
  writeStore(store)
  res.json(store.trips[index])
})

app.delete('/api/trips/:id', auth, async (req, res) => {
  if (pool) {
    await ensurePostgres()
    const result = await pool.query('DELETE FROM trips WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])
    if (!result.rowCount) return res.status(404).json({ error: 'Trip not found.' })
  } else {
    const store = readStore()
    const before = store.trips.length
    store.trips = store.trips.filter(t => !(String(t.id) === req.params.id && t.userId === req.user.id))
    if (store.trips.length === before) return res.status(404).json({ error: 'Trip not found.' })
    writeStore(store)
  }
  res.status(204).end()
})

app.get('/api/profile', auth, async (req, res) => {
  if (pool) {
    await ensurePostgres()
    const result = await pool.query('SELECT id,name,email FROM users WHERE id=$1', [req.user.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Profile not found.' })
    return res.json(result.rows[0])
  }
  const user = readStore().users.find(item => item.id === req.user.id)
  if (!user) return res.status(404).json({ error: 'Profile not found.' })
  res.json({ id: user.id, name: user.name, email: user.email })
})

app.patch('/api/profile', auth, async (req, res) => {
  const name = req.body.name?.trim()
  const email = req.body.email?.trim().toLowerCase()
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || ''))
    return res.status(400).json({ error: 'Enter a name and a valid email address.' })
  try {
    if (pool) {
      await ensurePostgres()
      const result = await pool.query(
        'UPDATE users SET name=$1,email=$2 WHERE id=$3 RETURNING id,name,email',
        [name, email, req.user.id],
      )
      if (!result.rows.length) return res.status(404).json({ error: 'Profile not found.' })
      return res.json(result.rows[0])
    }
    const store = readStore()
    if (store.users.some(item => item.id !== req.user.id && item.email === email))
      return res.status(409).json({ error: 'That email is already in use.' })
    const user = store.users.find(item => item.id === req.user.id)
    if (!user) return res.status(404).json({ error: 'Profile not found.' })
    user.name = name
    user.email = email
    writeStore(store)
    res.json({ id: user.id, name: user.name, email: user.email })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That email is already in use.' })
    res.status(500).json({ error: 'Unable to update your profile.' })
  }
})

app.post('/api/profile/password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword || newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword))
    return res.status(400).json({ error: 'Use a new password of at least 8 characters with a letter and a number.' })
  try {
    let user
    if (pool) {
      await ensurePostgres()
      user = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id])).rows[0]
    } else {
      user = readStore().users.find(item => item.id === req.user.id)
    }
    const currentHash = user?.password_hash || user?.passwordHash
    if (!currentHash || !(await bcrypt.compare(currentPassword, currentHash)))
      return res.status(401).json({ error: 'Current password is incorrect.' })
    const passwordHash = await bcrypt.hash(newPassword, 12)
    if (pool) await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [passwordHash, req.user.id])
    else {
      const store = readStore()
      store.users.find(item => item.id === req.user.id).passwordHash = passwordHash
      writeStore(store)
    }
    res.json({ message: 'Password changed successfully.' })
  } catch {
    res.status(500).json({ error: 'Unable to change your password.' })
  }
})

app.get('/api/settings', auth, async (req, res) => {
  const defaults = { cabinBaggageLimit: 7, checkedBaggageLimit: 23, temperatureUnit: 'C', notifications: true }
  if (pool) {
    await ensurePostgres()
    const result = await pool.query('SELECT settings FROM user_settings WHERE user_id=$1', [req.user.id])
    return res.json({ ...defaults, ...(result.rows[0]?.settings || {}) })
  }
  const settings = readStore().settings.find(item => item.userId === req.user.id)?.settings
  res.json({ ...defaults, ...(settings || {}) })
})

app.put('/api/settings', auth, async (req, res) => {
  const { cabinBaggageLimit, checkedBaggageLimit, temperatureUnit, notifications } = req.body
  if (!Number.isFinite(cabinBaggageLimit) || cabinBaggageLimit < 1 || cabinBaggageLimit > 30 ||
      !Number.isFinite(checkedBaggageLimit) || checkedBaggageLimit < 1 || checkedBaggageLimit > 60 ||
      !['C', 'F'].includes(temperatureUnit) || typeof notifications !== 'boolean')
    return res.status(400).json({ error: 'Please enter valid baggage limits and preferences.' })
  const settings = { cabinBaggageLimit, checkedBaggageLimit, temperatureUnit, notifications }
  if (pool) {
    await ensurePostgres()
    await pool.query(
      `INSERT INTO user_settings (user_id,settings) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=NOW()`,
      [req.user.id, JSON.stringify(settings)],
    )
    return res.json(settings)
  }
  const store = readStore()
  const existing = store.settings.find(item => item.userId === req.user.id)
  if (existing) existing.settings = settings
  else store.settings.push({ userId: req.user.id, settings })
  writeStore(store)
  res.json(settings)
})

app.get('/api/saved-lists', auth, async (req, res) => {
  if (pool) {
    await ensurePostgres()
    const result = await pool.query('SELECT id,name,items,created_at,updated_at FROM saved_lists WHERE user_id=$1 ORDER BY updated_at DESC', [req.user.id])
    return res.json(result.rows)
  }
  res.json(readStore().savedLists.filter(item => item.userId === req.user.id))
})

app.post('/api/saved-lists', auth, async (req, res) => {
  const name = req.body.name?.trim()
  const items = req.body.items
  if (!name || !Array.isArray(items)) return res.status(400).json({ error: 'A list name and item array are required.' })
  if (pool) {
    await ensurePostgres()
    const result = await pool.query(
      'INSERT INTO saved_lists (user_id,name,items) VALUES ($1,$2,$3) RETURNING id,name,items,created_at,updated_at',
      [req.user.id, name, JSON.stringify(items)],
    )
    return res.status(201).json(result.rows[0])
  }
  const store = readStore()
  const list = { id: Date.now(), userId: req.user.id, name, items, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  store.savedLists.push(list)
  writeStore(store)
  res.status(201).json(list)
})

app.put('/api/saved-lists/:id', auth, async (req, res) => {
  const name = req.body.name?.trim()
  const items = req.body.items
  if (!name || !Array.isArray(items)) return res.status(400).json({ error: 'A list name and item array are required.' })
  if (pool) {
    const result = await pool.query(
      'UPDATE saved_lists SET name=$1,items=$2,updated_at=NOW() WHERE id=$3 AND user_id=$4 RETURNING id,name,items,created_at,updated_at',
      [name, JSON.stringify(items), req.params.id, req.user.id],
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Saved list not found.' })
    return res.json(result.rows[0])
  }
  const store = readStore()
  const list = store.savedLists.find(item => String(item.id) === req.params.id && item.userId === req.user.id)
  if (!list) return res.status(404).json({ error: 'Saved list not found.' })
  list.name = name
  list.items = items
  list.updatedAt = new Date().toISOString()
  writeStore(store)
  res.json(list)
})

app.delete('/api/saved-lists/:id', auth, async (req, res) => {
  if (pool) {
    const result = await pool.query('DELETE FROM saved_lists WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])
    if (!result.rowCount) return res.status(404).json({ error: 'Saved list not found.' })
  } else {
    const store = readStore()
    const before = store.savedLists.length
    store.savedLists = store.savedLists.filter(item => !(String(item.id) === req.params.id && item.userId === req.user.id))
    if (store.savedLists.length === before) return res.status(404).json({ error: 'Saved list not found.' })
    writeStore(store)
  }
  res.status(204).end()
})

app.get('/api/weather', async (req, res) => {
  const { lat, lon } = req.query
  if (!lat || !lon) return res.status(400).json({ error: 'Latitude and longitude are required.' })
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,rain,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`
    const response = await fetch(url)
    if (!response.ok) throw new Error('Weather provider unavailable')
    res.json(await response.json())
  } catch {
    res.status(502).json({ error: 'Live weather is temporarily unavailable.' })
  }
})

export default app

if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`PackPal API listening on http://localhost:${PORT}`))
}
