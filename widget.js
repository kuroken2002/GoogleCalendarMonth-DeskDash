let currentDate = new Date();
let calendarEvents = [];
let visibleEvents = [];
let settings = {};

const MAX_EVENTS_PER_DAY = 3;
let refreshTimer = null;


/* =========================================================
   色
   ========================================================= */

function normalizeColor(value, fallback) {
  const text = String(value || "").trim();

  if (
    /^#[0-9a-fA-F]{6}$/.test(text) ||
    /^#[0-9a-fA-F]{3}$/.test(text)
  ) {
    return text;
  }

  return fallback;
}

function applyColors() {
  const eventColor =
    normalizeColor(
      settings.eventColor,
      "#5096ff"
    );

  const multiDayColor =
    normalizeColor(
      settings.multiDayColor,
      "#4b91e1"
    );

  document.documentElement.style.setProperty(
    "--event-color",
    eventColor
  );

  document.documentElement.style.setProperty(
    "--multi-day-color",
    multiDayColor
  );
}


/* =========================================================
   日付
   ========================================================= */

function dateKey(date) {
  const year = date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0
  );
}

function addDays(date, days) {
  const result = new Date(date);

  result.setDate(
    result.getDate() + days
  );

  return result;
}

function addMonths(date, months) {
  return new Date(
    date.getFullYear(),
    date.getMonth() + months,
    1,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );
}

function formatDate(date) {
  return (
    `${date.getFullYear()}年` +
    `${date.getMonth() + 1}月` +
    `${date.getDate()}日`
  );
}

function formatTime(date) {
  const hh =
    String(
      date.getHours()
    ).padStart(2, "0");

  const mm =
    String(
      date.getMinutes()
    ).padStart(2, "0");

  return `${hh}:${mm}`;
}

function formatDateTime(date) {
  return (
    `${formatDate(date)} ` +
    `${formatTime(date)}`
  );
}

function copyTime(source, target) {
  target.setHours(
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds()
  );

  return target;
}


/* =========================================================
   ICS解析
   ========================================================= */

function unescapeIcsText(text) {
  return String(text || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDate(value) {
  if (!value) {
    return null;
  }

  value =
    String(value).trim();

  if (/^\d{8}$/.test(value)) {
    return new Date(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
      0,
      0,
      0,
      0
    );
  }

  const match =
    value.match(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/
    );

  if (!match) {
    return null;
  }

  const [
    ,
    y,
    mo,
    d,
    h,
    mi,
    s,
    z
  ] = match;

  if (z === "Z") {
    return new Date(
      Date.UTC(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(h),
        Number(mi),
        Number(s)
      )
    );
  }

  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s)
  );
}

function unfoldIcs(text) {
  return String(text || "")
    .replace(
      /\r?\n[ \t]/g,
      ""
    );
}


/* =========================================================
   RRULE解析
   ========================================================= */

function parseRRule(text) {
  if (!text) {
    return null;
  }

  const rule = {};

  for (
    const part of
    String(text).split(";")
  ) {
    const index =
      part.indexOf("=");

    if (index < 0) {
      continue;
    }

    const key =
      part
        .slice(0, index)
        .toUpperCase();

    const value =
      part.slice(index + 1);

    rule[key] = value;
  }

  rule.FREQ =
    String(
      rule.FREQ || ""
    ).toUpperCase();

  rule.INTERVAL =
    Math.max(
      1,
      Number(
        rule.INTERVAL || 1
      ) || 1
    );

  if (rule.COUNT) {
    rule.COUNT =
      Number(rule.COUNT);
  }

  if (rule.UNTIL) {
    rule.UNTIL =
      parseIcsDate(
        rule.UNTIL
      );
  }

  if (rule.BYDAY) {
    rule.BYDAY =
      rule.BYDAY
        .split(",")
        .map(
          value =>
            value
              .trim()
              .toUpperCase()
        )
        .filter(Boolean);
  } else {
    rule.BYDAY = [];
  }

  if (rule.BYMONTHDAY) {
    rule.BYMONTHDAY =
      rule.BYMONTHDAY
        .split(",")
        .map(Number)
        .filter(
          value =>
            Number.isInteger(value) &&
            value !== 0
        );
  } else {
    rule.BYMONTHDAY = [];
  }

  return rule;
}


/* =========================================================
   VEVENT解析
   ========================================================= */

function parseIcs(text) {
  const unfolded =
    unfoldIcs(text);

  const blocks =
    unfolded
      .split("BEGIN:VEVENT")
      .slice(1);

  const events = [];

  for (const block of blocks) {
    const endPos =
      block.indexOf(
        "END:VEVENT"
      );

    const body =
      endPos >= 0
        ? block.slice(
            0,
            endPos
          )
        : block;

    const lines =
      body.split(/\r?\n/);

    let summary = "";
    let startRaw = "";
    let endRaw = "";
    let uid = "";
    let rruleRaw = "";
    let recurrenceIdRaw = "";
    let status = "";

    let startIsAllDay = false;
    let endIsAllDay = false;

    const exdates = [];

    for (const line of lines) {
      const colon =
        line.indexOf(":");

      if (colon < 0) {
        continue;
      }

      const property =
        line.slice(
          0,
          colon
        );

      const value =
        line.slice(
          colon + 1
        );

      const propertyName =
        property
          .split(";")[0]
          .toUpperCase();

      if (
        propertyName ===
        "SUMMARY"
      ) {
        summary =
          unescapeIcsText(
            value
          );
      }

      if (
        propertyName ===
        "UID"
      ) {
        uid =
          value.trim();
      }

      if (
        propertyName ===
        "STATUS"
      ) {
        status =
          value
            .trim()
            .toUpperCase();
      }

      if (
        propertyName ===
        "RRULE"
      ) {
        rruleRaw =
          value.trim();
      }

      if (
        propertyName ===
        "RECURRENCE-ID"
      ) {
        recurrenceIdRaw =
          value.trim();
      }

      if (
        propertyName ===
        "DTSTART"
      ) {
        startRaw =
          value.trim();

        if (
          property
            .toUpperCase()
            .includes(
              "VALUE=DATE"
            ) ||
          /^\d{8}$/.test(
            startRaw
          )
        ) {
          startIsAllDay =
            true;
        }
      }

      if (
        propertyName ===
        "DTEND"
      ) {
        endRaw =
          value.trim();

        if (
          property
            .toUpperCase()
            .includes(
              "VALUE=DATE"
            ) ||
          /^\d{8}$/.test(
            endRaw
          )
        ) {
          endIsAllDay =
            true;
        }
      }

      if (
        propertyName ===
        "EXDATE"
      ) {
        const values =
          value.split(",");

        for (
          const item of values
        ) {
          const exdate =
            parseIcsDate(
              item.trim()
            );

          if (exdate) {
            exdates.push(
              exdate
            );
          }
        }
      }
    }

    const start =
      parseIcsDate(
        startRaw
      );

    if (!start) {
      continue;
    }

    let end =
      parseIcsDate(
        endRaw
      );

    if (!end) {
      end =
        new Date(start);

      if (startIsAllDay) {
        end.setDate(
          end.getDate() + 1
        );
      }
    }

    const recurrenceId =
      parseIcsDate(
        recurrenceIdRaw
      );

    events.push({
      uid,

      summary:
        summary ||
        "(予定)",

      start,
      end,

      allDay:
        startIsAllDay ||
        endIsAllDay,

      rrule:
        parseRRule(
          rruleRaw
        ),

      exdates,

      recurrenceId,

      status
    });
  }

  return events;
}


/* =========================================================
   繰り返し関連
   ========================================================= */

const WEEKDAY_MAP = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6
};

function parseByDayEntry(text) {
  const match =
    String(text)
      .toUpperCase()
      .match(
        /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/
      );

  if (!match) {
    return null;
  }

  return {
    ordinal:
      match[1]
        ? Number(match[1])
        : null,

    weekday:
      WEEKDAY_MAP[
        match[2]
      ]
  };
}

function daysInMonth(
  year,
  month
) {
  return new Date(
    year,
    month + 1,
    0
  ).getDate();
}

function nthWeekdayOfMonth(
  year,
  month,
  weekday,
  ordinal,
  timeSource
) {
  const totalDays =
    daysInMonth(
      year,
      month
    );

  let day = null;

  if (ordinal > 0) {
    const first =
      new Date(
        year,
        month,
        1
      );

    const offset =
      (
        weekday -
        first.getDay() +
        7
      ) % 7;

    const candidate =
      1 +
      offset +
      (ordinal - 1) * 7;

    if (
      candidate <=
      totalDays
    ) {
      day = candidate;
    }

  } else if (
    ordinal < 0
  ) {
    const last =
      new Date(
        year,
        month,
        totalDays
      );

    const offset =
      (
        last.getDay() -
        weekday +
        7
      ) % 7;

    const candidate =
      totalDays -
      offset +
      (ordinal + 1) * 7;

    if (candidate >= 1) {
      day = candidate;
    }
  }

  if (day === null) {
    return null;
  }

  return copyTime(
    timeSource,
    new Date(
      year,
      month,
      day
    )
  );
}

function allWeekdaysOfMonth(
  year,
  month,
  weekday,
  timeSource
) {
  const result = [];

  const totalDays =
    daysInMonth(
      year,
      month
    );

  for (
    let day = 1;
    day <= totalDays;
    day++
  ) {
    const candidate =
      new Date(
        year,
        month,
        day
      );

    if (
      candidate.getDay() ===
      weekday
    ) {
      result.push(
        copyTime(
          timeSource,
          candidate
        )
      );
    }
  }

  return result;
}

function monthDayToDate(
  year,
  month,
  monthDay,
  timeSource
) {
  const totalDays =
    daysInMonth(
      year,
      month
    );

  let day =
    monthDay;

  if (monthDay < 0) {
    day =
      totalDays +
      monthDay +
      1;
  }

  if (
    day < 1 ||
    day > totalDays
  ) {
    return null;
  }

  return copyTime(
    timeSource,
    new Date(
      year,
      month,
      day
    )
  );
}

function startOfWeek(
  date,
  weekStart = 1
) {
  const result =
    startOfDay(date);

  const diff =
    (
      result.getDay() -
      weekStart +
      7
    ) % 7;

  result.setDate(
    result.getDate() -
    diff
  );

  return result;
}

function recurrenceKey(date) {
  return String(
    date.getTime()
  );
}

function isExcludedOccurrence(
  event,
  date
) {
  for (
    const exdate of
    event.exdates || []
  ) {
    if (event.allDay) {
      if (
        dateKey(exdate) ===
        dateKey(date)
      ) {
        return true;
      }
    } else {
      if (
        exdate.getTime() ===
        date.getTime()
      ) {
        return true;
      }
    }
  }

  return false;
}

function createOccurrence(
  event,
  start
) {
  const duration =
    Math.max(
      0,
      event.end.getTime() -
      event.start.getTime()
    );

  return {
    ...event,

    start:
      new Date(start),

    end:
      new Date(
        start.getTime() +
        duration
      ),

    rrule: null,

    recurrenceId: null
  };
}


/* =========================================================
   DAILY
   ========================================================= */

function expandDaily(
  event,
  rangeStart,
  rangeEnd
) {
  const rule =
    event.rrule;

  const result = [];

  let candidate =
    new Date(
      event.start
    );

  let generatedCount = 0;

  const maxLoops = 20000;
  let loops = 0;

  const byDays =
    rule.BYDAY
      .map(
        parseByDayEntry
      )
      .filter(Boolean)
      .map(
        entry =>
          entry.weekday
      );

  while (
    candidate <
      rangeEnd &&
    loops <
      maxLoops
  ) {
    loops++;

    let allowed = true;

    if (
      byDays.length > 0 &&
      !byDays.includes(
        candidate.getDay()
      )
    ) {
      allowed = false;
    }

    if (allowed) {
      if (
        rule.UNTIL &&
        candidate >
          rule.UNTIL
      ) {
        break;
      }

      generatedCount++;

      if (
        !rule.COUNT ||
        generatedCount <=
          rule.COUNT
      ) {
        const occurrence =
          createOccurrence(
            event,
            candidate
          );

        if (
          occurrence.end >
            rangeStart &&
          occurrence.start <
            rangeEnd &&
          !isExcludedOccurrence(
            event,
            candidate
          )
        ) {
          result.push(
            occurrence
          );
        }
      }

      if (
        rule.COUNT &&
        generatedCount >=
          rule.COUNT
      ) {
        break;
      }
    }

    candidate =
      addDays(
        candidate,
        rule.INTERVAL
      );
  }

  return result;
}


/* =========================================================
   WEEKLY
   ========================================================= */

function expandWeekly(
  event,
  rangeStart,
  rangeEnd
) {
  const rule =
    event.rrule;

  const result = [];

  const weekStartDay =
    rule.WKST &&
    WEEKDAY_MAP[
      rule.WKST
    ] !== undefined
      ? WEEKDAY_MAP[
          rule.WKST
        ]
      : 1;

  let week =
    startOfWeek(
      event.start,
      weekStartDay
    );

  let generatedCount = 0;
  let loops = 0;

  const byDayEntries =
    rule.BYDAY.length > 0
      ? rule.BYDAY
          .map(
            parseByDayEntry
          )
          .filter(Boolean)
      : [
          {
            weekday:
              event.start
                .getDay()
          }
        ];

  while (
    week <
      rangeEnd &&
    loops <
      10000
  ) {
    loops++;

    const candidates = [];

    for (
      const entry of
      byDayEntries
    ) {
      const offset =
        (
          entry.weekday -
          weekStartDay +
          7
        ) % 7;

      let candidate =
        addDays(
          week,
          offset
        );

      candidate =
        copyTime(
          event.start,
          candidate
        );

      if (
        candidate <
        event.start
      ) {
        continue;
      }

      candidates.push(
        candidate
      );
    }

    candidates.sort(
      (a, b) =>
        a - b
    );

    for (
      const candidate of
      candidates
    ) {
      if (
        rule.UNTIL &&
        candidate >
          rule.UNTIL
      ) {
        return result;
      }

      generatedCount++;

      if (
        rule.COUNT &&
        generatedCount >
          rule.COUNT
      ) {
        return result;
      }

      const occurrence =
        createOccurrence(
          event,
          candidate
        );

      if (
        occurrence.end >
          rangeStart &&
        occurrence.start <
          rangeEnd &&
        !isExcludedOccurrence(
          event,
          candidate
        )
      ) {
        result.push(
          occurrence
        );
      }
    }

    week =
      addDays(
        week,
        7 *
        rule.INTERVAL
      );
  }

  return result;
}


/* =========================================================
   MONTHLY
   ========================================================= */

function monthlyCandidates(
  event,
  year,
  month
) {
  const rule =
    event.rrule;

  const candidates = [];

  if (
    rule.BYMONTHDAY.length >
    0
  ) {
    for (
      const monthDay of
      rule.BYMONTHDAY
    ) {
      const candidate =
        monthDayToDate(
          year,
          month,
          monthDay,
          event.start
        );

      if (candidate) {
        candidates.push(
          candidate
        );
      }
    }
  }

  if (
    rule.BYDAY.length >
    0
  ) {
    for (
      const byDay of
      rule.BYDAY
    ) {
      const entry =
        parseByDayEntry(
          byDay
        );

      if (!entry) {
        continue;
      }

      if (
        entry.ordinal !==
        null
      ) {
        const candidate =
          nthWeekdayOfMonth(
            year,
            month,
            entry.weekday,
            entry.ordinal,
            event.start
          );

        if (candidate) {
          candidates.push(
            candidate
          );
        }

      } else {
        candidates.push(
          ...allWeekdaysOfMonth(
            year,
            month,
            entry.weekday,
            event.start
          )
        );
      }
    }
  }

  if (
    rule.BYDAY.length === 0 &&
    rule.BYMONTHDAY.length ===
      0
  ) {
    const candidate =
      monthDayToDate(
        year,
        month,
        event.start.getDate(),
        event.start
      );

    if (candidate) {
      candidates.push(
        candidate
      );
    }
  }

  const map =
    new Map();

  for (
    const candidate of
    candidates
  ) {
    map.set(
      candidate.getTime(),
      candidate
    );
  }

  return Array
    .from(
      map.values()
    )
    .sort(
      (a, b) =>
        a - b
    );
}

function expandMonthly(
  event,
  rangeStart,
  rangeEnd
) {
  const rule =
    event.rrule;

  const result = [];

  let monthCursor =
    new Date(
      event.start.getFullYear(),
      event.start.getMonth(),
      1
    );

  let generatedCount = 0;
  let loops = 0;

  while (
    monthCursor <
      rangeEnd &&
    loops <
      5000
  ) {
    loops++;

    const year =
      monthCursor
        .getFullYear();

    const month =
      monthCursor
        .getMonth();

    const candidates =
      monthlyCandidates(
        event,
        year,
        month
      );

    for (
      const candidate of
      candidates
    ) {
      if (
        candidate <
        event.start
      ) {
        continue;
      }

      if (
        rule.UNTIL &&
        candidate >
          rule.UNTIL
      ) {
        return result;
      }

      generatedCount++;

      if (
        rule.COUNT &&
        generatedCount >
          rule.COUNT
      ) {
        return result;
      }

      const occurrence =
        createOccurrence(
          event,
          candidate
        );

      if (
        occurrence.end >
          rangeStart &&
        occurrence.start <
          rangeEnd &&
        !isExcludedOccurrence(
          event,
          candidate
        )
      ) {
        result.push(
          occurrence
        );
      }
    }

    monthCursor =
      addMonths(
        monthCursor,
        rule.INTERVAL
      );
  }

  return result;
}


/* =========================================================
   繰り返し展開
   ========================================================= */

function expandRecurringEvent(
  event,
  rangeStart,
  rangeEnd
) {
  if (!event.rrule) {
    return [event];
  }

  switch (
    event.rrule.FREQ
  ) {
    case "DAILY":
      return expandDaily(
        event,
        rangeStart,
        rangeEnd
      );

    case "WEEKLY":
      return expandWeekly(
        event,
        rangeStart,
        rangeEnd
      );

    case "MONTHLY":
      return expandMonthly(
        event,
        rangeStart,
        rangeEnd
      );

    default:
      return [event];
  }
}


/* =========================================================
   RECURRENCE-ID / 例外予定
   ========================================================= */

function expandEventsForRange(
  events,
  rangeStart,
  rangeEnd
) {
  const result = [];

  const overrides =
    new Map();

  for (
    const event of events
  ) {
    if (
      event.recurrenceId &&
      event.uid
    ) {
      const key =
        `${event.uid}|` +
        `${recurrenceKey(
          event.recurrenceId
        )}`;

      overrides.set(
        key,
        event
      );
    }
  }

  for (
    const event of events
  ) {
    if (
      event.recurrenceId
    ) {
      continue;
    }

    if (
      event.status ===
      "CANCELLED"
    ) {
      continue;
    }

    const expanded =
      expandRecurringEvent(
        event,
        rangeStart,
        rangeEnd
      );

    for (
      const occurrence of
      expanded
    ) {
      if (event.uid) {
        const key =
          `${event.uid}|` +
          `${recurrenceKey(
            occurrence.start
          )}`;

        if (
          overrides.has(key)
        ) {
          continue;
        }
      }

      if (
        occurrence.end >
          rangeStart &&
        occurrence.start <
          rangeEnd
      ) {
        result.push(
          occurrence
        );
      }
    }
  }

  for (
    const override of
    overrides.values()
  ) {
    if (
      override.status ===
      "CANCELLED"
    ) {
      continue;
    }

    if (
      override.end >
        rangeStart &&
      override.start <
        rangeEnd
    ) {
      result.push({
        ...override,
        rrule: null
      });
    }
  }

  result.sort(
    (a, b) =>
      a.start -
      b.start
  );

  return result;
}


/* =========================================================
   予定判定
   ========================================================= */

function eventOccursOnDate(
  event,
  date
) {
  const dayStart =
    startOfDay(date);

  const dayEnd =
    addDays(
      dayStart,
      1
    );

  return (
    event.start < dayEnd &&
    event.end > dayStart
  );
}

function getEffectiveEndDate(
  event
) {
  if (!event.end) {
    return new Date(
      event.start
    );
  }

  if (
    event.end.getTime() <=
    event.start.getTime()
  ) {
    return new Date(
      event.start
    );
  }

  return new Date(
    event.end.getTime() - 1
  );
}

function isMultiDayEvent(
  event
) {
  return (
    dateKey(
      event.start
    ) !==
    dateKey(
      getEffectiveEndDate(
        event
      )
    )
  );
}


/* =========================================================
   予定取得
   ========================================================= */

function allEventsForDate(date) {
  return visibleEvents
    .filter(
      event =>
        eventOccursOnDate(
          event,
          date
        )
    )
    .sort(
      (a, b) => {
        const aMulti =
          isMultiDayEvent(a);

        const bMulti =
          isMultiDayEvent(b);

        if (
          aMulti &&
          !bMulti
        ) {
          return -1;
        }

        if (
          !aMulti &&
          bMulti
        ) {
          return 1;
        }

        if (
          a.allDay &&
          !b.allDay
        ) {
          return -1;
        }

        if (
          !a.allDay &&
          b.allDay
        ) {
          return 1;
        }

        return (
          a.start -
          b.start
        );
      }
    );
}

function allNormalEventsForDate(
  date
) {
  return allEventsForDate(
    date
  ).filter(
    event =>
      !isMultiDayEvent(
        event
      )
  );
}


/* =========================================================
   通常予定
   ========================================================= */

function createNormalEvent(event) {
  const el =
    document.createElement(
      "div"
    );

  el.classList.add(
    "event"
  );

  if (event.allDay) {
    el.classList.add(
      "all-day"
    );

    el.textContent =
      event.summary;

  } else {
    el.textContent =
      `${formatTime(event.start)} ${event.summary}`;
  }

  el.title =
    event.summary;

  el.style.cursor =
    "pointer";

  el.addEventListener(
    "click",
    clickEvent => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();

      openEventPopup(
        event
      );
    }
  );

  return el;
}


/* =========================================================
   +○件
   ========================================================= */

function createMoreEvent(
  count,
  date
) {
  const el =
    document.createElement(
      "div"
    );

  el.classList.add(
    "event",
    "more-events"
  );

  el.textContent =
    `+${count}件`;

  el.title =
    "この日の全予定を表示";

  el.addEventListener(
    "click",
    clickEvent => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();

      openDayPopup(
        date
      );
    }
  );

  return el;
}


/* =========================================================
   日別一覧ポップアップ
   ========================================================= */

function formatPopupEvent(
  event,
  date
) {
  let prefix = "";

  if (event.allDay) {
    prefix = "終日";

  } else if (
    dateKey(event.start) ===
    dateKey(date)
  ) {
    prefix =
      formatTime(
        event.start
      );

  } else {
    prefix = "継続";
  }

  return {
    prefix,

    title:
      event.summary,

    multi:
      isMultiDayEvent(
        event
      )
  };
}

function openDayPopup(date) {
  const overlay =
    document.getElementById(
      "popupOverlay"
    );

  const title =
    document.getElementById(
      "popupTitle"
    );

  const list =
    document.getElementById(
      "popupEvents"
    );

  if (
    !overlay ||
    !title ||
    !list
  ) {
    return;
  }

  title.textContent =
    `${date.getMonth() + 1}月${date.getDate()}日の予定`;

  list.innerHTML = "";

  const events =
    allEventsForDate(
      date
    );

  for (
    const event of events
  ) {
    const info =
      formatPopupEvent(
        event,
        date
      );

    const row =
      document.createElement(
        "div"
      );

    row.classList.add(
      "popup-event"
    );

    if (info.multi) {
      row.classList.add(
        "popup-multi"
      );
    }

    row.style.cursor =
      "pointer";

    const time =
      document.createElement(
        "div"
      );

    time.classList.add(
      "popup-time"
    );

    time.textContent =
      info.prefix;

    const text =
      document.createElement(
        "div"
      );

    text.classList.add(
      "popup-text"
    );

    text.textContent =
      info.title;

    row.appendChild(
      time
    );

    row.appendChild(
      text
    );

    row.addEventListener(
      "click",
      clickEvent => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();

        openEventPopup(
          event
        );
      }
    );

    list.appendChild(
      row
    );
  }

  overlay.classList.remove(
    "hidden"
  );
}


/* =========================================================
   予定詳細
   ========================================================= */

function addDetailRow(
  container,
  label,
  value,
  multi
) {
  const row =
    document.createElement(
      "div"
    );

  row.classList.add(
    "popup-event"
  );

  if (multi) {
    row.classList.add(
      "popup-multi"
    );
  }

  const labelElement =
    document.createElement(
      "div"
    );

  labelElement.classList.add(
    "popup-time"
  );

  labelElement.textContent =
    label;

  const valueElement =
    document.createElement(
      "div"
    );

  valueElement.classList.add(
    "popup-text"
  );

  valueElement.textContent =
    value;

  row.appendChild(
    labelElement
  );

  row.appendChild(
    valueElement
  );

  container.appendChild(
    row
  );
}

function openEventPopup(event) {
  const overlay =
    document.getElementById(
      "popupOverlay"
    );

  const title =
    document.getElementById(
      "popupTitle"
    );

  const list =
    document.getElementById(
      "popupEvents"
    );

  if (
    !overlay ||
    !title ||
    !list
  ) {
    return;
  }

  title.textContent =
    event.summary;

  list.innerHTML = "";

  const multi =
    isMultiDayEvent(
      event
    );

  let typeText =
    "時間指定";

  if (event.allDay) {
    typeText =
      multi
        ? "複数日の終日予定"
        : "終日予定";

  } else if (multi) {
    typeText =
      "複数日予定";
  }

  addDetailRow(
    list,
    "種類",
    typeText,
    multi
  );

  if (event.allDay) {
    const effectiveEnd =
      getEffectiveEndDate(
        event
      );

    addDetailRow(
      list,
      "開始",
      formatDate(
        event.start
      ),
      multi
    );

    addDetailRow(
      list,
      "終了",
      formatDate(
        effectiveEnd
      ),
      multi
    );

  } else {
    addDetailRow(
      list,
      "開始",
      formatDateTime(
        event.start
      ),
      multi
    );

    addDetailRow(
      list,
      "終了",
      formatDateTime(
        event.end
      ),
      multi
    );
  }

  overlay.classList.remove(
    "hidden"
  );
}


/* =========================================================
   ポップアップ閉じる
   ========================================================= */

function closeDayPopup() {
  const overlay =
    document.getElementById(
      "popupOverlay"
    );

  if (overlay) {
    overlay.classList.add(
      "hidden"
    );
  }
}

document
  .getElementById(
    "popupClose"
  )
  .addEventListener(
    "click",
    event => {
      event.preventDefault();
      event.stopPropagation();

      closeDayPopup();
    }
  );

document
  .getElementById(
    "popupOverlay"
  )
  .addEventListener(
    "click",
    event => {
      if (
        event.target.id ===
        "popupOverlay"
      ) {
        event.preventDefault();
        event.stopPropagation();

        closeDayPopup();
      }
    }
  );


/* =========================================================
   月間カレンダー
   ========================================================= */

function getCalendarStartDate() {
  const year =
    currentDate
      .getFullYear();

  const month =
    currentDate
      .getMonth();

  const firstDay =
    new Date(
      year,
      month,
      1
    );

  return new Date(
    year,
    month,
    1 -
      firstDay.getDay()
  );
}

function renderCalendar() {
  const grid =
    document.getElementById(
      "calendarGrid"
    );

  const title =
    document.getElementById(
      "monthTitle"
    );

  if (
    !grid ||
    !title
  ) {
    return;
  }

  applyColors();

  grid
    .querySelectorAll(
      ".day"
    )
    .forEach(
      el =>
        el.remove()
    );

  const layer =
    document.getElementById(
      "multiDayLayer"
    );

  if (layer) {
    layer.innerHTML = "";
  }

  const year =
    currentDate
      .getFullYear();

  const month =
    currentDate
      .getMonth();

  title.textContent =
    `${year}年 ${month + 1}月`;

  const startDate =
    getCalendarStartDate();

  const visibleEnd =
    addDays(
      startDate,
      42
    );

  visibleEvents =
    expandEventsForRange(
      calendarEvents,
      startDate,
      visibleEnd
    );

  const today =
    new Date();

  for (
    let i = 0;
    i < 42;
    i++
  ) {
    const cellDate =
      addDays(
        startDate,
        i
      );

    const day =
      document.createElement(
        "div"
      );

    day.classList.add(
      "day"
    );

    day.dataset.index =
      String(i);

    day.dataset.date =
      dateKey(
        cellDate
      );

    if (
      cellDate.getMonth() !==
      month
    ) {
      day.classList.add(
        "other-month"
      );
    }

    if (
      cellDate.getDay() ===
      0
    ) {
      day.classList.add(
        "sunday"
      );
    }

    if (
      cellDate.getDay() ===
      6
    ) {
      day.classList.add(
        "saturday"
      );
    }

    if (
      cellDate.getFullYear() ===
        today.getFullYear() &&
      cellDate.getMonth() ===
        today.getMonth() &&
      cellDate.getDate() ===
        today.getDate()
    ) {
      day.classList.add(
        "today"
      );
    }

    const dateNumber =
      document.createElement(
        "div"
      );

    dateNumber.classList.add(
      "date"
    );

    dateNumber.textContent =
      cellDate.getDate();

    day.appendChild(
      dateNumber
    );

    const eventContainer =
      document.createElement(
        "div"
      );

    eventContainer.classList.add(
      "day-events"
    );

    const events =
      allNormalEventsForDate(
        cellDate
      );

    if (
      events.length <=
      MAX_EVENTS_PER_DAY
    ) {
      for (
        const event of events
      ) {
        eventContainer.appendChild(
          createNormalEvent(
            event
          )
        );
      }

    } else {
      const visibleCount =
        MAX_EVENTS_PER_DAY -
        1;

      for (
        let j = 0;
        j < visibleCount;
        j++
      ) {
        eventContainer.appendChild(
          createNormalEvent(
            events[j]
          )
        );
      }

      const hiddenCount =
        events.length -
        visibleCount;

      eventContainer.appendChild(
        createMoreEvent(
          hiddenCount,
          cellDate
        )
      );
    }

    day.appendChild(
      eventContainer
    );

    grid.appendChild(
      day
    );
  }

  requestAnimationFrame(
    () => {
      drawMultiDayBands();
    }
  );
}


/* =========================================================
   複数日予定
   ========================================================= */

function getVisibleMultiDayEvents() {
  const start =
    getCalendarStartDate();

  const end =
    addDays(
      start,
      42
    );

  return visibleEvents
    .filter(
      event => {
        if (
          !isMultiDayEvent(
            event
          )
        ) {
          return false;
        }

        return (
          event.start < end &&
          event.end > start
        );
      }
    )
    .sort(
      (a, b) =>
        a.start -
        b.start
    );
}

function buildMultiDaySegments() {
  const calendarStart =
    getCalendarStartDate();

  const calendarEnd =
    addDays(
      calendarStart,
      41
    );

  const events =
    getVisibleMultiDayEvents();

  const segments = [];

  for (
    const event of events
  ) {
    let start =
      startOfDay(
        event.start
      );

    let end =
      startOfDay(
        getEffectiveEndDate(
          event
        )
      );

    if (
      start <
      calendarStart
    ) {
      start =
        new Date(
          calendarStart
        );
    }

    if (
      end >
      calendarEnd
    ) {
      end =
        new Date(
          calendarEnd
        );
    }

    let cursor =
      new Date(start);

    while (
      cursor <= end
    ) {
      const index =
        Math.round(
          (
            startOfDay(
              cursor
            ) -
            startOfDay(
              calendarStart
            )
          ) /
          86400000
        );

      const week =
        Math.floor(
          index / 7
        );

      const weekEnd =
        addDays(
          calendarStart,
          week * 7 + 6
        );

      const segmentEnd =
        end < weekEnd
          ? end
          : weekEnd;

      const startIndex =
        Math.round(
          (
            startOfDay(
              cursor
            ) -
            startOfDay(
              calendarStart
            )
          ) /
          86400000
        );

      const endIndex =
        Math.round(
          (
            startOfDay(
              segmentEnd
            ) -
            startOfDay(
              calendarStart
            )
          ) /
          86400000
        );

      segments.push({
        event,
        week,
        startIndex,
        endIndex,

        showTitle:
          dateKey(cursor) ===
            dateKey(
              event.start
            ) ||
          cursor.getDay() ===
            0
      });

      cursor =
        addDays(
          segmentEnd,
          1
        );
    }
  }

  return segments;
}

function assignSegmentLanes(
  segments
) {
  const byWeek =
    new Map();

  for (
    const segment of segments
  ) {
    if (
      !byWeek.has(
        segment.week
      )
    ) {
      byWeek.set(
        segment.week,
        []
      );
    }

    byWeek
      .get(
        segment.week
      )
      .push(
        segment
      );
  }

  for (
    const weekSegments
    of byWeek.values()
  ) {
    weekSegments.sort(
      (a, b) =>
        a.startIndex -
        b.startIndex
    );

    const lanes = [];

    for (
      const segment
      of weekSegments
    ) {
      let lane = 0;

      while (true) {
        const lastEnd =
          lanes[lane];

        if (
          lastEnd ===
            undefined ||
          segment.startIndex >
            lastEnd
        ) {
          lanes[lane] =
            segment.endIndex;

          segment.lane =
            lane;

          break;
        }

        lane++;
      }
    }
  }

  return segments;
}

function drawMultiDayBands() {
  const grid =
    document.getElementById(
      "calendarGrid"
    );

  const layer =
    document.getElementById(
      "multiDayLayer"
    );

  if (
    !grid ||
    !layer
  ) {
    return;
  }

  layer.innerHTML = "";

  grid
    .querySelectorAll(
      ".day-events"
    )
    .forEach(
      el => {
        el.style.marginTop =
          "0px";
      }
    );

  let segments =
    buildMultiDaySegments();

  segments =
    assignSegmentLanes(
      segments
    );

  const laneCount =
    new Array(42)
      .fill(0);

  for (
    const segment of segments
  ) {
    for (
      let i =
        segment.startIndex;

      i <=
        segment.endIndex;

      i++
    ) {
      laneCount[i] =
        Math.max(
          laneCount[i],
          segment.lane + 1
        );
    }
  }


  /* =======================================================
     ★変更点
     複数日予定と通常予定の間隔を
     19px → 22px に変更
     ======================================================= */

  for (
    let i = 0;
    i < 42;
    i++
  ) {
    const day =
      grid.querySelector(
        `.day[data-index="${i}"]`
      );

    if (!day) {
      continue;
    }

    const eventContainer =
      day.querySelector(
        ".day-events"
      );

    if (
      eventContainer &&
      laneCount[i] > 0
    ) {
      eventContainer
        .style
        .marginTop =
        `${laneCount[i] * 22}px`;
    }
  }


  /* 複数日予定バー描画 */

  for (
    const segment of segments
  ) {
    const firstCell =
      grid.querySelector(
        `.day[data-index="${segment.startIndex}"]`
      );

    const lastCell =
      grid.querySelector(
        `.day[data-index="${segment.endIndex}"]`
      );

    if (
      !firstCell ||
      !lastCell
    ) {
      continue;
    }

    const band =
      document.createElement(
        "div"
      );

    band.classList.add(
      "multi-band"
    );

    band.textContent =
      segment.showTitle
        ? segment.event.summary
        : "\u00A0";

    band.title =
      segment.event.summary;

    band.style.cursor =
      "pointer";

    band.addEventListener(
      "click",
      clickEvent => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();

        openEventPopup(
          segment.event
        );
      }
    );

    const left =
      firstCell.offsetLeft +
      5;

    const right =
      lastCell.offsetLeft +
      lastCell.offsetWidth -
      5;

    const top =
      firstCell.offsetTop +
      25 +
      (
        segment.lane *
        19
      );

    band.style.left =
      `${left}px`;

    band.style.top =
      `${top}px`;

    band.style.width =
      `${right - left}px`;

    layer.appendChild(
      band
    );
  }
}


/* =========================================================
   Google Calendar読込
   ========================================================= */

async function loadCalendar() {
  const url =
    String(
      settings.calendarUrl ||
      ""
    ).trim();

  if (!url) {
    calendarEvents = [];
    visibleEvents = [];

    renderCalendar();

    return;
  }

  try {
    const res =
      await dd.http.fetch({
        url
      });

    if (
      res.status !==
      200
    ) {
      throw new Error(
        `HTTP ${res.status}`
      );
    }

    calendarEvents =
      parseIcs(
        res.bodyText ||
        ""
      );

    renderCalendar();

  } catch (err) {
    calendarEvents = [];
    visibleEvents = [];

    renderCalendar();
  }
}


/* =========================================================
   自動更新
   ========================================================= */

function stopRefreshTimer() {
  if (refreshTimer) {
    clearInterval(
      refreshTimer
    );

    refreshTimer = null;
  }
}

function startRefreshTimer() {
  stopRefreshTimer();

  let minutes =
    Number(
      settings.refreshMinutes
    );

  if (
    !Number.isFinite(
      minutes
    ) ||
    minutes < 5
  ) {
    minutes = 30;
  }

  refreshTimer =
    setInterval(
      () => {
        loadCalendar();
      },

      minutes *
      60 *
      1000
    );
}


/* =========================================================
   前月 / 翌月
   ========================================================= */

document
  .getElementById(
    "prev"
  )
  .addEventListener(
    "click",
    event => {
      event.preventDefault();
      event.stopPropagation();

      closeDayPopup();

      currentDate =
        new Date(
          currentDate
            .getFullYear(),

          currentDate
            .getMonth() - 1,

          1
        );

      renderCalendar();
    }
  );

document
  .getElementById(
    "next"
  )
  .addEventListener(
    "click",
    event => {
      event.preventDefault();
      event.stopPropagation();

      closeDayPopup();

      currentDate =
        new Date(
          currentDate
            .getFullYear(),

          currentDate
            .getMonth() + 1,

          1
        );

      renderCalendar();
    }
  );


/* =========================================================
   サイズ変更
   ========================================================= */

window.addEventListener(
  "resize",
  () => {
    requestAnimationFrame(
      () => {
        drawMultiDayBands();
      }
    );
  }
);


/* =========================================================
   起動
   ========================================================= */

async function main() {
  await dd.ready;

  await dd.settings.bind(
    next => {
      const oldUrl =
        settings.calendarUrl;

      const oldRefresh =
        settings.refreshMinutes;

      settings = next;

      applyColors();

      renderCalendar();

      if (
        settings.calendarUrl !==
        oldUrl
      ) {
        loadCalendar();
      }

      if (
        settings.refreshMinutes !==
        oldRefresh
      ) {
        startRefreshTimer();
      }
    }
  );

  applyColors();

  await loadCalendar();

  startRefreshTimer();
}

main();