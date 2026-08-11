const { google } = require('googleapis');
const logger = require('../monitoring/logger');
const { captureException } = require('../monitoring/sentry');

let calendarClient = null;

function initCalendar() {
  if (!process.env.GOOGLE_CALENDAR_CLIENT_EMAIL || !process.env.GOOGLE_CALENDAR_PRIVATE_KEY) {
    logger.warn('Google Calendar not configured — calendar features disabled');
    return false;
  }

  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CALENDAR_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_CALENDAR_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar'],
    );
    calendarClient = google.calendar({ version: 'v3', auth });
    logger.info('Google Calendar initialized');
    return true;
  } catch (err) {
    logger.error('Failed to initialize Google Calendar', { error: err.message });
    return false;
  }
}

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

async function createEvent({ summary, description, startTime, endTime, attendees, location, timezone = 'America/New_York' }) {
  if (!calendarClient) {
    logger.info(`[CALENDAR SIMULATED] Event: ${summary}, Start: ${startTime}`);
    return { id: 'simulated', htmlLink: '#' };
  }

  try {
    const event = await calendarClient.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary,
        description,
        location,
        start: { dateTime: startTime, timeZone: timezone },
        end: { dateTime: endTime, timeZone: timezone },
        attendees: attendees?.map(email => ({ email })),
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
      },
    });

    logger.info(`Calendar event created`, { eventId: event.data.id, summary });
    return { id: event.data.id, htmlLink: event.data.htmlLink };
  } catch (err) {
    captureException(err, { extra: { summary } });
    throw err;
  }
}

async function updateEvent(eventId, updates) {
  if (!calendarClient) return { id: 'simulated' };

  try {
    const event = await calendarClient.events.update({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: updates,
    });
    return { id: event.data.id, htmlLink: event.data.htmlLink };
  } catch (err) {
    captureException(err, { extra: { eventId } });
    throw err;
  }
}

async function deleteEvent(eventId) {
  if (!calendarClient) return;

  try {
    await calendarClient.events.delete({ calendarId: CALENDAR_ID, eventId });
    logger.info(`Calendar event deleted`, { eventId });
  } catch (err) {
    captureException(err, { extra: { eventId } });
  }
}

async function listEvents(timeMin, timeMax, maxResults = 50) {
  if (!calendarClient) return [];

  try {
    const response = await calendarClient.events.list({
      calendarId: CALENDAR_ID,
      timeMin: timeMin || new Date().toISOString(),
      timeMax,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return response.data.items;
  } catch (err) {
    captureException(err);
    return [];
  }
}

async function createTourEvent(tour) {
  return createEvent({
    summary: `Property Tour - ${tour.listing_key}`,
    description: `Tour for ${tour.name}\nEmail: ${tour.email}\nPhone: ${tour.phone || 'N/A'}\nNotes: ${tour.notes || 'N/A'}`,
    startTime: `${tour.tour_date}T${tour.tour_time}`,
    endTime: `${tour.tour_date}T${addMinutes(tour.tour_time, tour.duration_minutes || 30)}`,
    attendees: [tour.email, process.env.AGENT_CALENDAR_EMAIL].filter(Boolean),
    location: tour.listing_address,
  });
}

async function createOpenHouseEvent(openHouse) {
  return createEvent({
    summary: `Open House - ${openHouse.listing_key}`,
    description: openHouse.description || 'Open House',
    startTime: `${openHouse.date}T${openHouse.start_time}`,
    endTime: `${openHouse.date}T${openHouse.end_time}`,
    location: openHouse.listing_address,
  });
}

function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

module.exports = {
  initCalendar, createEvent, updateEvent, deleteEvent, listEvents,
  createTourEvent, createOpenHouseEvent,
};
