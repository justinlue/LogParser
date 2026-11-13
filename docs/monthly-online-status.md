# Monthly online status

Enter an SN or VIN in REMOTE_FETCH, choose a cloud source, then choose a month
under MONTHLY_ONLINE_STATUS and click CHECK STATUS. The dates beside FETCH do
not affect this monthly query.

Each UTC+8 day is online when at least one matching cloud log was received.
Online cells show the number of cloud records and their first/last receive
times. Offline means no logs were found, which cannot prove disconnection.
Future days are marked upcoming and excluded from the elapsed-day total.
Today is included but may be incomplete. Counts from BOTH combine both
providers and can include duplicate uploads.

The calendar describes the device it was drawn for. HIDE collapses it and
leaves the summary; SHOW brings it back, so a result that took minutes to
fetch is not lost. The whole result is cleared once logs of a different SN are
loaded (by FETCH or a local file), and a status result that arrives after the
user has moved to another device's logs is shown as its summary only.
Re-loading the same SN keeps the result.

`GET /api/online?sn=<15-character-SN>&month=YYYY-MM&source=both`
also accepts `vin=<17-character-VIN>`. With both identifiers, the SN is searched
and a VIN mismatch is reported as a warning. VIN-only lookup must find an SN
in retained cloud history. Cloud retention limits the history available.

The endpoint runs `query.py --times-only` asynchronously with a five-minute
timeout, then buckets receive timestamps without parsing device events or
writing downloads. Aliyun projects receive timestamps via SQL. Tencent's
low-frequency search reads receive metadata from paginated records. A failed
or unavailable selected provider returns an error, not an offline calendar.
Credentials must permit reading logstore/topic retention metadata as well as logs.
The status query searches retained indexed history through tomorrow before
filtering receive timestamps, so delayed uploads across month boundaries are
included. This can take longer for devices with a large retained history.

Run `npm test` for the Node suite. Start with `npm start` (or set `NO_OPEN=1`
to suppress the browser). Python and the existing cloud SDKs/configuration
are required for live cloud checks.
Formatter fixtures explicitly select UTC independently of the application's
current +8 default.
