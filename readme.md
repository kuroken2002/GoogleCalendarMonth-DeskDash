# Google Calendar Month for DeskDash

A monthly Google Calendar widget for DeskDash.

Display your Google Calendar events directly on your Windows desktop using an iCal / ICS calendar URL.

![Google Calendar Month for DeskDash](screenshot.png)

---

## Features

- Google Calendar iCal / ICS integration
- Monthly calendar view
- Previous / next month navigation
- Timed events
- All-day events
- Multi-day events displayed as continuous bars
- `+N` display when a day contains many events
- Click `+N` to open a full event list for that day
- Click an event to open event details
- Automatic calendar refresh
- Configurable refresh interval
- Configurable normal event color
- Configurable multi-day event color
- Highlight for the current day
- Separate Sunday / Saturday colors
- Previous and next month dates shown in the calendar grid
- Resizable DeskDash widget
- Interactive calendar area to prevent accidental desktop icon clicks

---

## Recurring Events

Recurring calendar events are supported.

Supported RRULE features include:

- `FREQ=DAILY`
- `FREQ=WEEKLY`
- `FREQ=MONTHLY`
- `INTERVAL`
- `COUNT`
- `UNTIL`
- `BYDAY`
- `BYMONTHDAY`
- `EXDATE`

Ordinal weekday rules are also supported.

Example:

`BYDAY=3TU`

This means the third Tuesday of every month.

Example:

`BYDAY=-1FR`

This means the last Friday of every month.

Excluded recurring dates from Google Calendar are handled using `EXDATE`.

---

## Multi-day Events

Events spanning multiple days are displayed as horizontal bars across the calendar.

For example, an event from September 24 to September 26 is shown as one continuous multi-day event bar.

If the event crosses into another week, it is split into separate weekly segments.

---

## Installation

### 1. Install DeskDash

Install DeskDash on Windows.

### 2. Open the DeskDash widgets folder

Place this widget inside the DeskDash widgets directory.

Example:

`Documents\DeskDash\widgets\google-calendar-month`

If your Documents folder is managed by OneDrive, it may look like:

`OneDrive\Documents\DeskDash\widgets\google-calendar-month`

### 3. Widget files

The folder should contain:

```text
google-calendar-month
├─ .deskdash
├─ manifest.json
├─ index.html
├─ style.css
└─ widget.js
```

### 4. Reload DeskDash widgets

Right-click the DeskDash icon in the Windows system tray and select:

`Reload widgets`

The widget should then appear in DeskDash.

---

## Google Calendar Setup

This widget uses a Google Calendar iCal / ICS URL.

### Google Calendar

Open Google Calendar and go to the settings for the calendar you want to display.

Find:

`Integrate calendar`

Then locate:

`Secret address in iCal format`

Copy the iCal URL.

### DeskDash

Open the settings for Google Calendar Month and paste the URL into:

`Google Calendar iCal URL`

The calendar events will then be loaded into the widget.

> [!IMPORTANT]
> Your private iCal URL should be treated as a secret.
> Do not publish it on GitHub, in screenshots, Issues, README files, or other public locations.

---

## Settings

### Google Calendar iCal URL

The private iCal / ICS URL used to load Google Calendar events.

### Refresh interval

Sets how often the calendar is refreshed.

Default: 30 minutes.

### Normal event color

Changes the color used for normal events.

### Multi-day event color

Changes the color used for multi-day event bars.

---

## Event Details

Click an event to display its details.

The detail popup can show:

- Event title
- Event type
- Start date / time
- End date / time

If a day contains more events than can be displayed, the calendar shows something like:

`+3`

Click it to display all events for that day.

Events in the daily event list can also be clicked to open their details.

---

## Tested Features

The following features have been tested:

- Normal events
- Timed events
- All-day events
- Multi-day events
- Events spanning multiple months
- DAILY recurrence
- WEEKLY recurrence
- MONTHLY recurrence
- `BYDAY`
- Ordinal weekday recurrence
- Last weekday recurrence
- `EXDATE`
- `+N` event list
- Event detail popup
- Previous / next month navigation
- Automatic refresh
- Widget resizing

---

## Known Limitations

### Google Calendar event colors

Google Calendar's individual event colors are currently not imported.

Instead, DeskDash settings provide separate colors for:

- Normal events
- Multi-day events

Support for Google Calendar API event colors may be added in a future version.

### iCal / ICS based

This widget currently uses iCal / ICS instead of the Google Calendar API.

Because of this, some Google Calendar-specific metadata may not be available.

---

## Version

Current version: `v1.0.0`

---

## Changelog

### v1.0.0

Initial release.

- Google Calendar iCal / ICS integration
- Monthly calendar view
- Timed events
- All-day events
- Multi-day event bars
- Recurring events
- RRULE support
- BYDAY support
- EXDATE support
- Event detail popup
- Daily event list popup
- Automatic refresh
- Configurable event colors
- Previous / next month navigation
- Current day highlight

---

## Privacy

This widget reads calendar events using the iCal URL configured by the user.

The private Google Calendar iCal URL should never be committed directly into the source code or uploaded to a public repository.

Before publishing or sharing this widget, make sure your personal iCal URL is not stored in any source file.

---

## License

No license has been specified yet.

---

## Author

Created for DeskDash.