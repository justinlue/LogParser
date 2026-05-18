#!/usr/bin/env python3
import argparse
import json
import os
import csv
import sys
import traceback
import time, datetime

HERE = os.path.dirname(os.path.abspath(__file__))


def dbg(msg):
    # print debug to stderr so node can capture it separately
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
    if not s: return ''
    return s[:4] + '...' + s[-4:]


def main():
    parser = argparse.ArgumentParser(description='Query logs from Aliyun or fallback to local raw file')
    parser.add_argument('--sn', required=True, help='device SN, e.g. NSBB22100D59F7B')
    parser.add_argument('--start', help='start date in YYYY-MM-DD')
    parser.add_argument('--end', help='end date in YYYY-MM-DD')
    args = parser.parse_args()

    dbg(f'Starting query for SN={args.sn} start={args.start} end={args.end}')

    cfg = load_webconfig()
    ak = load_accesskey()
    # prefer AccessKey.csv values if present
    if 'access_key_id' in ak:
        cfg.setdefault('access_key_id', ak['access_key_id'])
    if 'access_key_secret' in ak:
        cfg.setdefault('access_key_secret', ak['access_key_secret'])

    dbg(f'Effective config keys: {list(cfg.keys())}')
    dbg(f'AccessKeyId (masked): {mask(cfg.get("access_key_id"))}')

    # Attempt to use aliyun log python SDK if available
    try:
        dbg('Attempting to import aliyun.log SDK')
        from aliyun.log import LogClient
        dbg('Imported aliyun.log.LogClient')

        endpoint = cfg.get('endpoint')
        access_key_id = cfg.get('access_key_id')
        access_key_secret = cfg.get('access_key_secret')
        project = cfg.get('project_name')
        logstore = cfg.get('logstore_name')

        dbg(f'Endpoint: {endpoint}'); dbg(f'Project: {project}'); dbg(f'Logstore: {logstore}')

        if not all([endpoint, access_key_id, access_key_secret, project, logstore]):
            raise RuntimeError('WebConfig.json missing required keys for aliyun log')

        dbg('Creating LogClient')
        client = LogClient(endpoint, access_key_id, access_key_secret)
        dbg('LogClient created')

        # convert provided YYYY-MM-DD dates to epoch seconds (UTC)
        from_time = None
        to_time = None
        if args.start:
            try:
                dt = datetime.datetime.strptime(args.start, "%Y-%m-%d")
                dt = dt.replace(tzinfo=datetime.timezone.utc, hour=0, minute=0, second=0)
                from_time = int(dt.timestamp())
            except Exception:
                try:
                    from_time = int(args.start)
                except Exception:
                    from_time = None
        if args.end:
            try:
                dt2 = datetime.datetime.strptime(args.end, "%Y-%m-%d")
                dt2 = dt2.replace(tzinfo=datetime.timezone.utc, hour=23, minute=59, second=59)
                to_time = int(dt2.timestamp())
            except Exception:
                try:
                    to_time = int(args.end)
                except Exception:
                    to_time = None

        dbg(f'Calling get_log with from_time={from_time} to_time={to_time} query=__tag__:sn: {args.sn}')
        log_datas = client.get_log(project, logstore,
                                   from_time=from_time,
                                   to_time=to_time,
                                   query='__tag__:sn: '+args.sn,
                                   size=-1)
        dbg('get_log returned')

        try:
            logs_iter = list(log_datas.get_logs())
            dbg(f'Number of get_logs() groups: {len(logs_iter)}')
        except Exception:
            dbg('Could not iterate get_logs() response')
            logs_iter = []

        log_datas_list = [getattr(i, 'contents', {}) for i in logs_iter]
        nums = 0
        for i in logs_iter:
            try:
                nums += len(i.contents.get('FG_log_0', []))
            except Exception:
                pass
        dbg(f'Compiled datas count={len(log_datas_list)} total_size_estimate={nums}')

        log_datas_info = {'datas': log_datas_list, 'count': getattr(log_datas, 'get_count', lambda: None)(), 'total_size': nums}
        # save result to downloads dir
        downloads = os.path.join(HERE, 'downloads')
        os.makedirs(downloads, exist_ok=True)
        out_fname = os.path.join(downloads, 'raw_{}_{}.json'.format(args.sn, int(time.time())))
        try:
            with open(out_fname, 'w', encoding='utf8') as fo:
                json.dump(log_datas_info, fo)
            dbg(f'Saved query result to {out_fname}')
            # print saved path as JSON to stdout for the caller
            print(json.dumps({'saved': os.path.abspath(out_fname)}))
            sys.stdout.flush()
            dbg('Printed saved path to stdout')
            return 0
        except Exception as e:
            dbg('Failed to save query result: ' + str(e))
            dbg(traceback.format_exc())
            # fall back to printing the JSON to stdout
            print(json.dumps(log_datas_info))
            dbg('Printed JSON result to stdout')
            return 0

    except Exception as exc:  # fallback when SDK missing or query fails
        dbg('Exception during aliyun query: ' + str(exc))
        dbg(traceback.format_exc())
        # Try to find a local raw CSV named raw_<SN>.csv
        fname = os.path.join(HERE, f'raw_{args.sn}.csv')
        dbg(f'Looking for local fallback file: {fname}')
        if os.path.exists(fname):
            dbg('Found local fallback file, returning content')
            with open(fname, 'r', encoding='utf8') as f:
                content = f.read()
            print(json.dumps({'source': 'local', 'filename': fname, 'content': content}))
            return 0

        # If neither SDK nor local file are available, return error and include debug in stderr
        err = {'error': 'failed to query aliyun and no local fallback file', 'exception': str(exc)}
        print(json.dumps(err))
        return 2


if __name__ == '__main__':
    sys.exit(main())
