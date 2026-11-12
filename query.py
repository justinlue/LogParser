#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Query device logs from Aliyun SLS and/or Tencent Cloud CLS.

Both cloud platforms expose the same logical log record shape, so results are
merged into a single ``datas`` list and handed to the Node.js parser unchanged.
"""
import argparse
import json
import os
import csv
import sys
import traceback
import datetime
import re

HERE = os.path.dirname(os.path.abspath(__file__))


def dbg(msg):
    # debug output goes to stderr so node can capture it separately
    print(msg, file=sys.stderr)
    sys.stderr.flush()


def load_webconfig():
    p = os.path.join(HERE, 'WebConfig.json')
    dbg(f'Looking for WebConfig at: {p}')
    if os.path.exists(p):
        with open(p, 'r', encoding='utf8') as f:
            cfg = json.load(f)
            dbg(f'Loaded WebConfig keys: {list(cfg.keys())}')
            return cfg
    dbg('WebConfig.json not found')
    return {}


def load_accesskey():
    p = os.path.join(HERE, 'AccessKey.csv')
    dbg(f'Looking for AccessKey at: {p}')
    if os.path.exists(p):
        with open(p, 'r', encoding='utf8') as f:
            r = csv.reader(f)
            rows = list(r)
            dbg(f'AccessKey.csv rows: {len(rows)}')
            if len(rows) >= 2:
                dbg('Found AccessKey credentials in CSV')
                return {'access_key_id': rows[1][0], 'access_key_secret': rows[1][1]}
    dbg('AccessKey.csv not found or incomplete')
    return {}


def mask(s):
    if not s:
        return ''
    return s[:4] + '...' + s[-4:]


def to_epoch_local(s, end_of_day=False):
    """Convert a date/epoch/ISO input into epoch seconds (UTC+8)."""
    if not s:
        return None
    s = str(s).strip()
    # accept YYYY-MM-DD or YYYY/MM/DD
    m = re.match(r'^(\d{4})[\/-](\d{2})[\/-](\d{2})$', s)
    if m:
        y = int(m.group(1)); mo = int(m.group(2)); d = int(m.group(3))
        tz = datetime.timezone(datetime.timedelta(hours=8))
        if end_of_day:
            dt = datetime.datetime(y, mo, d, 23, 59, 59, tzinfo=tz)
        else:
            dt = datetime.datetime(y, mo, d, 0, 0, 0, tzinfo=tz)
        return int(dt.timestamp())
    # try epoch seconds integer
    try:
        return int(s)
    except Exception:
        pass
    # try ISO parse
    try:
        ss = s.replace('Z', '+00:00')
        dt = datetime.datetime.fromisoformat(ss)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return int(dt.timestamp())
    except Exception:
        return None


def default_time_window():
    """Default search window mirrors the desktop tool: 2025-02-25 .. now+1d."""
    tz = datetime.timezone(datetime.timedelta(hours=8))
    start = datetime.datetime(2025, 2, 25, 0, 0, 0, tzinfo=tz)
    end = datetime.datetime.now(tz) + datetime.timedelta(days=1)
    end = end.replace(hour=23, minute=59, second=59, microsecond=0)
    return int(start.timestamp()), int(end.timestamp())


def receive_time_key(d):
    r = d.get('__tag__:__receive_time__')
    if r is None:
        return 0
    if isinstance(r, (int, float)):
        return int(r)
    digits = re.sub(r'\D', '', str(r))
    return int(digits) if digits else 0


class WebLogsAliyun:
    def __init__(self, cfg):
        self._valid = True
        self._error = None
        self._endpoint = cfg.get('endpoint')
        self._access_key_id = cfg.get('access_key_id')
        self._access_key_secret = cfg.get('access_key_secret')
        self._project = cfg.get('project_name')
        self._logstore = cfg.get('logstore_name')

        if not all([self._endpoint, self._access_key_id,
                    self._access_key_secret, self._project, self._logstore]):
            self._valid = False
            self._error = 'WebConfig.json missing required aliyun keys'
            return

        try:
            from aliyun.log import LogClient
            self._client = LogClient(self._endpoint,
                                     self._access_key_id,
                                     self._access_key_secret)
        except Exception as e:
            self._valid = False
            self._error = str(e)

    def is_valid(self):
        return self._valid

    def resolve_sn_from_vin(self, from_time, to_time, vin, strict=False):
        if not self._valid:
            return None
        try:
            lookup = self._client.get_log(self._project, self._logstore,
                                          from_time=from_time,
                                          to_time=to_time,
                                          query=vin,
                                          reverse=strict,
                                          size=1)
            if strict and not lookup.is_completed():
                raise RuntimeError('Incomplete Aliyun VIN lookup')
            for g in lookup.get_logs():
                contents = getattr(g, 'contents', {}) or {}
                if contents.get('__tag__:sn'):
                    return contents.get('__tag__:sn')
        except Exception:
            if strict:
                raise
            dbg('Aliyun VIN lookup failed:\n' + traceback.format_exc())
        return None

    def query_logs(self, from_time, to_time, sn):
        if not self._valid:
            return {'datas': [], 'count': 0, 'total_size': 0}
        try:
            log_datas = self._client.get_log(self._project, self._logstore,
                                             from_time=from_time,
                                             to_time=to_time,
                                             query='__tag__:sn: ' + sn,
                                             size=-1)
            logs_iter = list(log_datas.get_logs())
            datas = [getattr(i, 'contents', {}) for i in logs_iter]
            nums = 0
            for i in logs_iter:
                try:
                    nums += len(i.contents.get('FG_log_0', ''))
                except Exception:
                    pass
            return {'datas': datas,
                    'count': getattr(log_datas, 'get_count', lambda: len(datas))(),
                    'total_size': nums}
        except Exception:
            dbg('Aliyun query_logs failed:\n' + traceback.format_exc())
            return {'datas': [], 'count': 0, 'total_size': 0}


    def status_window(self):
        now = int(datetime.datetime.now().timestamp())
        retention = int(self._client.get_logstore(self._project, self._logstore).get_ttl())
        if retention == 3650:  # SLS sentinel for permanent retention
            created = self._client.get_project(self._project).get_create_time()
            start = to_epoch_local(created)
            if start is None:
                raise RuntimeError('Could not read Aliyun project creation time')
        else:
            start = max(0, now - (retention + 1) * 86400)
        return start, now + 86400

    def receive_times(self, from_time, to_time, sn):
        # Project only cloud receive timestamps; never parse event payloads.
        # SLS bounds filter indexed log time, which can differ from receive time.
        # Search retained history and filter receive metadata explicitly instead.
        sql = ('__tag__:sn: ' + sn +
               ' | select "__tag__:__receive_time__" as t where '
               'cast("__tag__:__receive_time__" as bigint) >= ' + str(from_time) +
               ' and cast("__tag__:__receive_time__" as bigint) < ' + str(to_time) +
               ' limit 1000000')
        indexed_start, indexed_end = self.status_window()
        times = []
        while indexed_start < indexed_end:
            # SLS can return incomplete SQL results over long indexed ranges.
            # Disjoint 30-day windows keep each query small without losing
            # receive-time matches near the selected month's boundaries.
            stop = min(indexed_start + 30 * 86400, indexed_end)
            result = self._client.get_log(self._project, self._logstore,
                                          from_time=indexed_start, to_time=stop,
                                          query=sql)
            if not result.is_completed():
                raise RuntimeError('Aliyun returned an incomplete status query; retry')
            rows = list(result.get_logs())
            if len(rows) >= 1000000:
                raise RuntimeError('Too many logs for a complete monthly status query')
            times.extend(receive_time_key({'__tag__:__receive_time__':
                                          (getattr(r, 'contents', {}) or {}).get('t')})
                         for r in rows)
            indexed_start = stop
        return times


class WebLogsTencent:
    def __init__(self, cfg):
        self._valid = True
        self._error = None
        tcfg = cfg.get('tencent') or {}

        self._access_key_id = tcfg.get('access_key_id') or tcfg.get('secret_id')
        self._access_key_secret = tcfg.get('access_key_secret') or tcfg.get('secret_key')
        self._endpoint = tcfg.get('endpoint')
        self._ap_area = tcfg.get('region') or tcfg.get('ap_area')
        self._topic_id = tcfg.get('topic_id')

        if not all([self._access_key_id, self._access_key_secret,
                    self._ap_area, self._topic_id]):
            self._valid = False
            self._error = 'WebConfig.json missing required tencent keys'
            return

        try:
            from tencentcloud.common import credential
            from tencentcloud.common.profile.client_profile import ClientProfile
            from tencentcloud.common.profile.http_profile import HttpProfile
            from tencentcloud.cls.v20201016 import cls_client, models
            self._models = models
            cred = credential.Credential(self._access_key_id, self._access_key_secret)
            http_profile = HttpProfile()
            # NOTE: do NOT set http_profile.endpoint to the region-specific host
            # (ap-shanghai.cls.tencentcs.com). The SDK's HttpProfile.endpoint is
            # the API gateway (default cls.tencentcloudapi.com); using the region
            # host makes the SDK call the wrong endpoint and fail to parse the
            # response. The desktop reference tool stores this value but leaves
            # the endpoint unset for the same reason.
            client_profile = ClientProfile()
            client_profile.httpProfile = http_profile
            self._client = cls_client.ClsClient(cred, self._ap_area, client_profile)
        except Exception as e:
            self._valid = False
            self._error = str(e)

    def is_valid(self):
        return self._valid

    def _log_data_transform(self, data):
        log_datas = []
        tz8 = datetime.timezone(datetime.timedelta(hours=8))
        for i in data:
            try:
                raw_log = json.loads(i.LogJson)
            except Exception:
                dbg('Failed to parse CLS LogJson: ' + str(getattr(i, 'LogJson', ''))[:200])
                continue
            tag = raw_log.get('__TAG__', {}) or {}
            receive_time_ms = tag.get('receive_time', 0)
            try:
                receive_time = int(receive_time_ms) // 1000
            except Exception:
                receive_time = 0
            item = {
                'FG_log_0': raw_log.get('LOG', ''),
                '__topic__': getattr(i, 'TopicName', ''),
                '__tag__:e': 'unknown',
                '__tag__:sn': raw_log.get('SN', ''),
                '__tag__:t': datetime.datetime.fromtimestamp(receive_time, tz=tz8).strftime(
                    '%Y-%m-%d %H:%M:%S') if receive_time else '',
                '__tag__:__pack_id__': getattr(i, 'PkgLogId', ''),
                '__tag__:__client_ip__': tag.get('client_ip', ''),
                '__tag__:__receive_time__': receive_time,
            }
            log_datas.append(item)
        return log_datas

    def _search(self, from_time, to_time, query, limit, strict=False):
        models = self._models
        req = models.SearchLogRequest()
        req.From = int(from_time) * 1000
        req.To = int(to_time) * 1000
        req.TopicId = self._topic_id
        req.SyntaxRule = 1
        req.Query = query
        req.Limit = limit
        req.Sort = 'asc'
        req.Context = ''

        logs = []
        if strict:
            # Context pagination is capped at 10,000 records. Offset pagination
            # allows a busy device's complete retained history to be searched.
            req.Offset = 0
            while True:
                resp = self._client.SearchLog(req)
                page = resp.Results or []
                logs.extend(page)
                if resp.ListOver:
                    return logs
                if not page:
                    raise RuntimeError('Tencent returned an incomplete status search')
                req.Offset += len(page)
        try:
            resp = self._client.SearchLog(req)
            logs.extend(resp.Results or [])
            next_context = resp.Context
            while next_context:
                req.Context = next_context
                next_resp = self._client.SearchLog(req)
                logs.extend(next_resp.Results or [])
                next_context = next_resp.Context
        except Exception:
            dbg('Tencent CLS search failed:\n' + traceback.format_exc())
        return logs

    def resolve_sn_from_vin(self, from_time, to_time, vin, strict=False):
        if not self._valid:
            return None
        if strict:
            while to_time > from_time:
                start = max(from_time, to_time - 86400)
                logs = self._search(start, to_time, vin, 1000, strict=True)
                datas = sorted(self._log_data_transform(logs), key=receive_time_key, reverse=True)
                for data in datas:
                    if data['__tag__:sn']:
                        return data['__tag__:sn']
                to_time = start
            return None
        logs = self._search(from_time, to_time, vin, 100)
        datas = sorted(self._log_data_transform(logs),
                       key=receive_time_key, reverse=True)
        for d in datas:
            if d['__tag__:sn']:
                return d['__tag__:sn']
        return None

    def query_logs(self, from_time, to_time, sn):
        if not self._valid:
            return {'datas': [], 'count': 0, 'total_size': 0}
        logs = self._search(from_time, to_time, sn, 500)
        datas = self._log_data_transform(logs)
        total_size = sum(len(getattr(i, 'LogJson', '')) for i in logs)
        return {'datas': datas, 'count': len(datas), 'total_size': total_size}


    def status_window(self):
        request = self._models.DescribeTopicsRequest()
        topic_filter = self._models.Filter()
        topic_filter.Key = 'topicId'
        topic_filter.Values = [self._topic_id]
        request.Filters = [topic_filter]
        topics = self._client.DescribeTopics(request).Topics or []
        topic = next((t for t in topics if t.TopicId == self._topic_id), None)
        if topic is None:
            raise RuntimeError('Could not read Tencent topic retention')
        now = int(datetime.datetime.now().timestamp())
        tz8 = datetime.timezone(datetime.timedelta(hours=8))
        created = int(datetime.datetime.fromisoformat(topic.CreateTime).replace(tzinfo=tz8).timestamp())
        start = created if topic.Period == 3640 else max(created, now - (topic.Period + 1) * 86400)
        return start, now + 86400

    def receive_times(self, from_time, to_time, sn):
        # Low-frequency CLS topics do not support SQL analysis. Read metadata
        # from search results without decoding or formatting device events.
        indexed_start, indexed_end = self.status_window()
        logs = []
        while indexed_start < indexed_end:
            # Cold CLS searches time out on broad ranges with sparse matches.
            stop = min(indexed_start + 86400, indexed_end)
            logs.extend(self._search(indexed_start, stop, sn, 1000, strict=True))
            indexed_start = stop
        times = []
        for log in logs:
            raw = json.loads(log.LogJson)
            if str(raw.get('SN', '')).upper() != sn.upper():
                continue
            timestamp = int((raw.get('__TAG__') or {}).get('receive_time', 0)) // 1000
            if timestamp <= 0:
                raise RuntimeError('Missing cloud receive timestamp')
            if from_time <= timestamp < to_time:
                times.append(timestamp)
        return times


def fallback_local(args, reason=''):
    dbg('Cloud query unavailable: ' + reason)
    fname = os.path.join(HERE, f'raw_{args.sn}.csv') if args.sn else None
    dbg(f'Looking for local fallback file: {fname}')
    if fname and os.path.exists(fname):
        dbg('Found local fallback file, returning content')
        with open(fname, 'r', encoding='utf8') as f:
            content = f.read()
        print(json.dumps({'source': 'local', 'filename': fname, 'content': content}))
        return 0
    print(json.dumps({'error': 'failed to query cloud and no local fallback file',
                      'details': reason}))
    return 2


def main():
    parser = argparse.ArgumentParser(
        description='Query logs from Aliyun SLS and/or Tencent CLS, or fallback to local raw file')
    parser.add_argument('--sn', help='device SN, e.g. NSBB22100D59F7B')
    parser.add_argument('--vin', help='vehicle VIN (17-char); resolved to SN before searching, '
                                      'or only checked against --sn when both are given')
    parser.add_argument('--start', help='start date in YYYY-MM-DD')
    parser.add_argument('--end', help='end date in YYYY-MM-DD')
    parser.add_argument('--source', help='aliyun, tencent, or both (default both)')
    parser.add_argument('--times-only', action='store_true',
                        help='return cloud receive times only, without parsing or saving logs')
    args = parser.parse_args()

    if not args.sn and not args.vin:
        print(json.dumps({'error': 'provide --sn and/or --vin'}))
        return 2

    source = (args.source or 'both').strip().lower()
    if source not in ('aliyun', 'tencent', 'both'):
        print(json.dumps({'error': 'invalid --source (use aliyun | tencent | both)'}))
        return 2

    dbg(f'Starting query for sn={args.sn} vin={args.vin} '
        f'start={args.start} end={args.end} source={source}')

    cfg = load_webconfig()
    ak = load_accesskey()
    # prefer AccessKey.csv values if present (aliyun override)
    if 'access_key_id' in ak:
        cfg.setdefault('access_key_id', ak['access_key_id'])
    if 'access_key_secret' in ak:
        cfg.setdefault('access_key_secret', ak['access_key_secret'])

    dbg(f'Effective config keys: {list(cfg.keys())}')
    dbg(f'Aliyun AccessKeyId (masked): {mask(cfg.get("access_key_id"))}')
    tencent_id = (cfg.get('tencent') or {}).get('access_key_id') or \
        (cfg.get('tencent') or {}).get('secret_id')
    dbg(f'Tencent SecretId (masked): {mask(tencent_id)}')

    providers = []
    if source in ('aliyun', 'both'):
        providers.append(('aliyun', WebLogsAliyun(cfg)))
    if source in ('tencent', 'both'):
        providers.append(('tencent', WebLogsTencent(cfg)))

    valid_providers = [(n, p) for n, p in providers if p.is_valid()]
    for n, p in providers:
        if not p.is_valid():
            dbg(f'{n} provider invalid: {getattr(p, "_error", "unknown error")}')
    if not valid_providers:
        if args.times_only:
            print(json.dumps({'error': 'No valid cloud provider configured'}))
            return 2
        return fallback_local(args, 'no valid cloud provider configured')

    if args.times_only and len(valid_providers) != len(providers):
        print(json.dumps({'error': 'A selected cloud provider is unavailable; choose an available source'}))
        return 2

    from_time, to_time = default_time_window()
    if args.start:
        from_time = to_epoch_local(args.start, end_of_day=False) or from_time
    if args.end:
        to_time = to_epoch_local(args.end, end_of_day=True) or to_time
    if args.times_only:
        # Status queries use an exclusive upper bound at next-day midnight.
        to_time += 1
    dbg(f'Time window: from_time={from_time} to_time={to_time}')

    # With both given, the SN is the sole search criterion; the VIN is still
    # resolved so the caller can tell whether it belongs to that SN (vin_sn).
    resolved_sn = args.sn
    vin_sn = None
    if args.vin:
        for name, p in valid_providers:
            try:
                lookup_from, lookup_to = p.status_window() if args.times_only else (from_time, to_time)
                sn = p.resolve_sn_from_vin(lookup_from, lookup_to, args.vin, strict=args.times_only)
            except Exception:
                dbg(traceback.format_exc())
                print(json.dumps({'error': 'Cloud VIN lookup failed'}))
                return 2
            if sn:
                vin_sn = sn
                dbg(f'Resolved VIN {args.vin} -> SN {vin_sn} via {name}')
                break
        if not resolved_sn:
            resolved_sn = vin_sn
        if not resolved_sn:
            dbg('VIN lookup returned no __tag__:sn on any provider')
            print(json.dumps({'error': f'could not resolve SN from VIN {args.vin}'}))
            return 2

    if args.times_only:
        try:
            if not re.fullmatch(r'[A-Za-z0-9]{15}', str(resolved_sn)):
                raise RuntimeError('Invalid resolved device SN')
            times = []
            for name, provider in valid_providers:
                times.extend(provider.receive_times(from_time, to_time, resolved_sn))
            if any(t <= 0 for t in times):
                raise RuntimeError('Cloud records are missing valid receive timestamps')
            print(json.dumps({'sn': resolved_sn, 'vin_sn': vin_sn,
                              'receive_times': sorted(times)}))
            return 0
        except Exception:
            dbg(traceback.format_exc())
            print(json.dumps({'error': 'Cloud status query failed; retry or select another source'}))
            return 2

    all_datas = []
    total_count = 0
    total_size = 0
    for name, p in valid_providers:
        info = p.query_logs(from_time, to_time, resolved_sn)
        datas = info.get('datas') or []
        all_datas.extend(datas)
        total_count += int(info.get('count') or 0)
        total_size += int(info.get('total_size') or 0)
        dbg(f'{name} provider returned {len(datas)} datas')

    # merge both clouds chronologically (ascending receive time)
    all_datas.sort(key=receive_time_key)
    dbg(f'Merged datas count={len(all_datas)} total_size={total_size}')

    result = {'datas': all_datas, 'count': total_count,
              'total_size': total_size, 'sn': resolved_sn}

    downloads = os.path.join(HERE, 'downloads')
    os.makedirs(downloads, exist_ok=True)
    # one file per SN (VIN queries land on their resolved SN): re-fetching overwrites
    out_fname = os.path.join(downloads, 'raw_{}.json'.format(resolved_sn))
    try:
        with open(out_fname, 'w', encoding='utf8') as fo:
            json.dump(result, fo)
        dbg(f'Saved query result to {out_fname}')
        print(json.dumps({'saved': os.path.abspath(out_fname), 'sn': resolved_sn,
                          'vin_sn': vin_sn}))
        sys.stdout.flush()
        return 0
    except Exception as e:
        dbg('Failed to save query result: ' + str(e))
        dbg(traceback.format_exc())
        # fall back to printing the JSON to stdout
        print(json.dumps(dict(result, vin_sn=vin_sn)))
        sys.stdout.flush()
        return 0


if __name__ == '__main__':
    sys.exit(main())
