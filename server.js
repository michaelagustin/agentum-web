const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://btcsqdatmuwbqobiilfb.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const APP_STORE_URL = process.env.APP_STORE_URL || 'https://apps.apple.com/app/agentum';
const TESTFLIGHT_URL = process.env.TESTFLIGHT_URL || 'https://testflight.apple.com/join/REPLACE_ME';
const TEAM_ID = 'P664VA8R4Y';
const BUNDLE_ID = 'vc.cerebro.Agentum';

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'allow' }));

// --- Apple App Site Association ---
app.get('/.well-known/apple-app-site-association', (req, res) => {
  res.type('application/json').json({
    applinks: {
      details: [
        {
          appIDs: [`${TEAM_ID}.${BUNDLE_ID}`],
          components: [
            { '/': '/entity/@*', comment: 'Entity profile pages' },
            { '/': '/event/*', comment: 'Event detail pages' }
          ]
        }
      ]
    }
  });
});

// --- Helper: Fetch from Supabase REST API ---
async function supabaseFetch(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] || null : data;
}

function avatarUrl(avatarPath) {
  if (!avatarPath) return null;
  if (avatarPath.startsWith('http')) return avatarPath;
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${avatarPath}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function getBaseUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${req.get('host')}`;
}

// --- Entity Preview ---
app.get('/entity/@:username', async (req, res) => {
  const { username } = req.params;
  const baseUrl = getBaseUrl(req);

  try {
    const entity = await supabaseFetch(
      'entities',
      `username=ilike.${encodeURIComponent(username)}&select=id,username,given_name,family_name,avatar,organization_name,type,title,location`
    );

    if (!entity) {
      return res.status(404).render('not-found', {
        message: 'Profile not found',
        baseUrl,
        appStoreUrl: APP_STORE_URL,
        testflightUrl: TESTFLIGHT_URL
      });
    }

    const displayName = entity.given_name && entity.family_name
      ? `${entity.given_name} ${entity.family_name}`
      : entity.given_name || entity.family_name || entity.username || 'Anonymous';

    res.render('entity', {
      entity,
      displayName,
      avatarSrc: avatarUrl(entity.avatar),
      deepLink: `agentum://entity/@${entity.username}`,
      canonicalUrl: `${baseUrl}/entity/@${entity.username}`,
      appStoreUrl: APP_STORE_URL,
      testflightUrl: TESTFLIGHT_URL
    });
  } catch (err) {
    console.error('Error fetching entity:', err);
    res.status(500).render('not-found', {
      message: 'Something went wrong',
      baseUrl,
      appStoreUrl: APP_STORE_URL
    });
  }
});

// --- Event Preview ---
app.get('/event/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const baseUrl = getBaseUrl(req);

  try {
    const event = await supabaseFetch(
      'events',
      `id=eq.${encodeURIComponent(eventId)}&select=id,title,start_time,end_time,location,description,avatar,visibility,owner_entity`
    );

    if (!event) {
      return res.status(404).render('not-found', {
        message: 'Event not found',
        baseUrl,
        appStoreUrl: APP_STORE_URL,
        testflightUrl: TESTFLIGHT_URL
      });
    }

    // Private events get a generic preview
    const isPrivate = event.visibility === 'private';

    res.render('event', {
      event,
      isPrivate,
      avatarSrc: avatarUrl(event.avatar),
      formattedDate: formatDate(event.start_time),
      formattedEndDate: formatDate(event.end_time),
      deepLink: `agentum://event/${event.id}`,
      canonicalUrl: `${baseUrl}/event/${event.id}`,
      appStoreUrl: APP_STORE_URL,
      testflightUrl: TESTFLIGHT_URL,
      description: event.description
        ? event.description.substring(0, 200) + (event.description.length > 200 ? '...' : '')
        : ''
    });
  } catch (err) {
    console.error('Error fetching event:', err);
    res.status(500).render('not-found', {
      message: 'Something went wrong',
      baseUrl,
      appStoreUrl: APP_STORE_URL
    });
  }
});

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Catch-all 404 ---
app.use((req, res) => {
  res.status(404).render('not-found', {
    message: 'Page not found',
    baseUrl: getBaseUrl(req),
    appStoreUrl: APP_STORE_URL
  });
});

app.listen(PORT, () => {
  console.log(`Agentum web server running on port ${PORT}`);
});
