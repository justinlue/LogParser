const DEFAULT_TZ_OFFSET_HOURS = (() => {
  const v = parseInt(process.env.TIMEZONE_OFFSET_HOURS, 10);
  return Number.isFinite(v) && !Number.isNaN(v) ? v : 8; // default to UTC+8
})();

let timezoneOffsetHours = DEFAULT_TZ_OFFSET_HOURS;

export function setTimezoneOffsetHours(h) {
  // if no value provided, leave default unchanged
  if (h === undefined || h === null) return;
  const n = Number(h);
  if (!Number.isFinite(n) || Number.isNaN(n)) return;
  timezoneOffsetHours = n;
}

export function formatRecord(record, dictionary) {
  const { rawTimestamp, eventId, params } = record;
  const time = formatTimestamp(rawTimestamp);
  const entry = dictionary.get(eventId);

  if (!entry) {
    return {
      time,
      eventId,
      message: `[unknown event ${eventId}]: ${params.join(', ')}`,
    };
  }

  return { time, eventId, message: buildMessage(eventId, entry, params) };
}

function buildMessage(eventId, { paramType, description }, params) {
  if (eventId === 3025) {
    // special parsing for vehicle status
    const hex = params[0] || '';
    try {
      const obj = parseVehicleStatus(hex);
      // render as key: value; pairs similar to sample
      return Object.entries(obj)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
    } catch (err) {
      return description + ` (+ parse error: ${err.message})`;
    }
  }

  // vehicle setting events: 1388, 1395, 1340, 1339
  if ([1388, 1395, 1340, 1339].includes(eventId)) {
    const hex = params[0] || '';
    try {
      const obj = parseVehicleSetting(hex);
      return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join('; ');
    } catch (err) {
      return description + ` (+ parse error: ${err.message})`;
    }
  }

  if (paramType === 'BYTES') {
    const hex = params[0] || '';
    const bytes = hex.match(/.{1,2}/g) || [];
    return description + bytes.map(b => b.toUpperCase()).join(',');
  }
  if (paramType === 'NONE') {
    return params.length > 0
      ? `${description} (+ extra: ${params.join(', ')})`
      : description;
  }
  if (paramType === 'INT32') {
    let idx = 0;
    const result = description.replace(/%[dx]/g, match => {
      if (idx >= params.length) return match;
      const n = parseInt(params[idx++], 10);
      if (Number.isNaN(n)) return params[idx - 1];
      return match === '%d' ? String(n) : n.toString(16);
    });
    return idx < params.length
      ? result + ` (+ extra: ${params.slice(idx).join(', ')})`
      : result;
  }
  if (paramType === 'STRING') {
    let idx = 0;
    const result = description.replace(/%s/g, () =>
      idx < params.length ? params[idx++] : '%s'
    );
    return idx < params.length
      ? result + ` (+ extra: ${params.slice(idx).join(', ')})`
      : result;
  }
  return description;
}

function parseVehicleSetting(hex) {
  if (!hex) throw new Error('no bytes');
  const clean = String(hex).replace(/[^0-9a-fA-F]/g, '');
  const buf = Buffer.from(clean, 'hex');

  const config = {
    struct: "<B H BBB",
    trans: {
      "Octer0": { is_next: true, mark: "0xFF", offset: 0, trans: {
        "lock_win_lift_en": { is_next: false, mark: "0x01", offset: 0 },
        "peps_en": { is_next: false, mark: "0x02", offset: 1 },
        "kick_en": { is_next: false, mark: "0x04", offset: 2 },
        "anti_theft_en": { is_next: false, mark: "0x08", offset: 3 },
        "repair_mode_en": { is_next: false, mark: "0x10", offset: 4 },
        "car_show_mode_en": { is_next: false, mark: "0x20", offset: 5 },
        "car_ctl_mode": { is_next: false, mark: "0x40", offset: 6 },
        "lock_whistle_en": { is_next: false, mark: "0x80", offset: 7 }
      }},
      "car_type": { is_next: false, mark: "0xFFFF", offset: 0 },
      "key_pwr_on_time": { is_next: false, mark: "0xFF", offset: 0 },
      "low_power_alarm_thr": { is_next: false, mark: "0xFF", offset: 0 },
      "Octer5": { is_next: true, mark: "0xFF", offset: 0, trans: {
        "anti-play": { is_next: false, mark: "0x01", offset: 0 },
        "trunk-ctrl-mode": { is_next: false, mark: "0x0e", offset: 1 },
        "approach_vehicle_wkup_en": { is_next: false, mark: "0x10", offset: 4 },
        "recv": { is_next: false, mark: "0xe0", offset: 5 }
      }}
    },
    show: ["lock_win_lift_en","peps_en","kick_en","anti_theft_en","repair_mode_en","car_show_mode_en",
           "car_ctl_mode","lock_whistle_en","car_type","key_pwr_on_time","low_power_alarm_thr",
           "anti-play","trunk-ctrl-mode","approach_vehicle_wkup_en"]
  };

  function parseStructTokens(structStr){
    const s = String(structStr).trim();
    const inner = s.startsWith('<') ? s.slice(1) : s;
    const parts = inner.split(/\s+/).map(t => t.replace(/,/g,''));
    const tokens = [];
    for (const p of parts) {
      if (!p) continue;
      const m = p.match(/^(\d+)([A-Za-z])$/);
      if (m) {
        const n = parseInt(m[1], 10);
        const ch = m[2];
        for (let i = 0; i < n; i++) tokens.push(ch);
        continue;
      }
      if (/^[A-Za-z]+$/.test(p)) {
        for (const ch of p) tokens.push(ch);
        continue;
      }
      tokens.push(p);
    }
    return tokens;
  }
  function sizeOfToken(tok){
    if(tok === 'B') return 1;
    if(tok === 'H') return 2;
    throw new Error('Unsupported token '+tok);
  }
  function readUIntLE(buffer, offset, size){
    if(size === 1) return offset < buffer.length ? buffer.readUInt8(offset) : 0;
    if(size === 2) return offset + 1 < buffer.length ? buffer.readUInt16LE(offset) : ((buffer[offset]||0) | ((buffer[offset+1]||0) << 8));
    throw new Error('Unsupported size '+size);
  }

  const tokens = parseStructTokens(config.struct);
  const keys = Object.keys(config.trans);
  const layout = {};
  let cur = 0;
  for(let i=0;i<keys.length;i++){
    const key = keys[i];
    const tok = tokens[i] || 'B';
    const sz = sizeOfToken(tok);
    layout[key] = { offset: cur, size: sz, def: config.trans[key] };
    cur += sz;
  }

  const out = {};
  for(const [field, info] of Object.entries(layout)){
    const baseVal = readUIntLE(buf, info.offset, info.size);
    const entry = info.def;
    if(entry.is_next && entry.trans){
      for(const [subk, subv] of Object.entries(entry.trans)){
        const mask = Number.parseInt(String(subv.mark), 16);
        const off = subv.offset || 0;
        const val = (baseVal & mask) >>> off;
        out[subk] = val;
      }
    } else {
      const mask = Number.parseInt(String(entry.mark), 16);
      const off = entry.offset || 0;
      const val = (baseVal & mask) >>> off;
      out[field] = val;
    }
  }

  const result = {};
  for(const k of config.show) result[k] = out[k];
  return result;
}

function parseVehicleStatus(hex) {
  if (!hex) throw new Error('no bytes');
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const buf = Buffer.from(clean, 'hex');
  const b = i => (i < buf.length ? buf[i] : 0);

  // helper for big-endian reads
  const readUInt16BE = (off) => ((b(off) << 8) | b(off + 1));
  const readUInt32BE = (off) => (((b(off) << 24) | (b(off + 1) << 16) | (b(off + 2) << 8) | b(off + 3)) >>> 0);
  const readInt16BE = (off) => {
    const u = readUInt16BE(off);
    return u & 0x8000 ? u - 0x10000 : u;
  };

  const byte0 = b(0);
  const byte1 = b(1);
  const byte2 = b(2);
  const byte3 = b(3);
  const byte4 = b(4);
  const byte48 = b(48);

  const raw = {
    startup: (byte0 >> 0) & 1,
    lock: (byte1 >> 5) & 1,
    gear_pos: b(35),
    door_lf: (byte0 >> 1) & 1,
    door_rf: (byte0 >> 2) & 1,
    door_lr: (byte0 >> 3) & 1,
    door_rr: (byte0 >> 4) & 1,
    door_bk: (byte0 >> 5) & 1,
    hood: (byte0 >> 6) & 1,
    fuel_cap: (byte0 >> 7) & 1,

    win_lf: (byte1 >> 0) & 1,
    win_rf: (byte1 >> 1) & 1,
    win_lr: (byte1 >> 2) & 1,
    win_rr: (byte1 >> 3) & 1,
    win_sky: (byte1 >> 4) & 1,
    
    repair: (byte1 >> 6) & 1,
    air_cond: (byte1 >> 7) & 1,

    // byte2 bits (lights / alarms)
    ac: (byte2 >> 0) & 1,
    width_light: (byte2 >> 1) & 1,
    low_beam: (byte2 >> 2) & 1,
    high_beam: (byte2 >> 3) & 1,
    fog_light: (byte2 >> 4) & 1,
    left_turn_light: (byte2 >> 5) & 1,
    right_turn_light: (byte2 >> 6) & 1,

    start_stop: (byte3 >> 0) & 1,
    ess: (byte3 >> 1) & 1,
    brake: (byte3 >> 2) & 1,
    hand_brake: (byte3 >> 3) & 1,
    car_alarm: (byte3 >> 4) & 1,
    bat_low_volt_alarm: (byte3 >> 5) & 1,
    curtain: (byte3 >> 6) & 1,

    seat_heat_lf: byte4 & 0x0F,
    seat_heat_rf: (byte4 >> 4) & 0x0F,

    // mileage and longer fields (big-endian)
    mileage_total: readUInt32BE(5),
    mileage_cur: readUInt16BE(9),
    mileage_endurance: readUInt16BE(11),
    mileage_maintenance: readUInt32BE(13),
    day_remain_maintenance: readUInt32BE(17),

    // raw temperature/int fields
    temper_water_raw: readInt16BE(21),
    temper_oil_raw: readInt16BE(23),
    oil_level: readUInt16BE(25),
    temper_outside_raw: readInt16BE(27),
    temper_inside_raw: readInt16BE(29),
    ac_left_raw: readInt16BE(31),
    ac_right_raw: readInt16BE(33),
    

    oil_consumption_raw: b(36),
    oil_consumption_ave_raw: b(37),

    // window positions (percent)
    win_lf_op: b(49),
    win_rf_op: b(50),
    win_lr_op: b(51),
    win_rr_op: b(52),
    win_sky_op: b(53),
    curtain_op: b(54),

    // engine / speed / battery
    engine_speed: readUInt16BE(38),
    speed: b(40),
    storage_bat_capacity: b(41),
    bat_capacity: b(42),
    voltage_raw: readUInt16BE(43),
    shutdown_countdown: readUInt16BE(45),

    wheel_heat: b(47),
    seat_vent_lf: byte48 & 0x0F,
    seat_vent_rf: (byte48 >> 4) & 0x0F,
  };

  // format temperatures: divide by 10, one decimal, Celsius
  const fmt = v => (typeof v === 'number' ? `${(v / 10).toFixed(1)}°C` : v);
  const fmt2 = v => (typeof v === 'number' ? `${(v / 10).toFixed(1)}L` : v);
  const fmt3 = v => (typeof v === 'number' ? `${(v / 10).toFixed(1)}V` : v);

  const obj = Object.assign({}, raw, {
    temper_water: fmt(raw.temper_water_raw),
    temper_oil: fmt(raw.temper_oil_raw),
    temper_outside: fmt(raw.temper_outside_raw),
    temper_inside: fmt(raw.temper_inside_raw),
    temp_air_lf: fmt(raw.ac_left_raw),
    temp_air_rf: fmt(raw.ac_right_raw),
    oil_consumption: fmt2(raw.oil_consumption_raw),
    oil_consumption_ave: fmt2(raw.oil_consumption_ave_raw),
    voltage: fmt3(raw.voltage_raw),
  });

  // remove raw temp fields
  delete obj.temper_water_raw;
  delete obj.temper_oil_raw;
  delete obj.temper_outside_raw;
  delete obj.temper_inside_raw;
  delete obj.ac_left_raw;
  delete obj.ac_right_raw;
  delete obj.oil_consumption_raw;
  delete obj.oil_consumption_ave_raw;
  delete obj.voltage_raw;

  return obj;
}

function formatTimestamp(rawTimestamp) {
  if (typeof rawTimestamp !== 'number' || !Number.isFinite(rawTimestamp)) {
    return '[invalid time]';
  }
  // apply configured timezone offset (hours) to UTC timestamp
  const offsetMs = timezoneOffsetHours * 3600 * 1000;
  const adjusted = rawTimestamp * 1000 + offsetMs;
  const d = new Date(adjusted);
  if (Number.isNaN(d.getTime())) return '[invalid time]';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}
