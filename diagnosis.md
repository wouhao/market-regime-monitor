# Data Issues Diagnosis

## Issue 1: Crypto indicators have no historical data (1D/7D/30D/MA20 all null)
**Root cause**: For `binance`, `defillama`, `coinalyze`, `coinalyze_oi` sources, the code only fetches `latest` value (a single number). 
The `prices` array stays empty `[]`, so `calculateChange(prices, 1)` returns null, `calculateMA20(prices)` returns null, and `sparklineData` is empty.

**Fix needed**: For each crypto source, fetch historical daily data (at least 30 days) to populate the `prices` array.
- Funding rate: Binance/OKX have historical funding rate endpoints
- OI: Coinalyze `open-interest-history` already returns daily data - just need to extract the time series
- Liquidations: Coinalyze `liquidation-history` has hourly data - aggregate to daily
- Stablecoin: DefiLlama has historical stablecoin data via `/stablecoincharts`

## Issue 2: Liquidation data shows $0
**Root cause**: The Coinalyze `liquidation-history` endpoint uses `from` parameter calculated as `now - 48h`.
But the `from` is in seconds, and the API might return empty data if the time range is wrong, or the `l` (long) and `s` (short) fields might not be what we expect.

**Fix needed**: Debug the Coinalyze liquidation API response format. Check if `l` and `s` are the correct field names.

## Issue 3: Funding rate format -0.000761%
**Root cause**: The Binance funding rate is already a percentage (e.g., 0.0001 = 0.01%). 
In `fetchFromBinance`, line 132: `rate * 100` converts 0.0001 to 0.01 (which is 0.01%).
But the OKX fallback also does `rate * 100`. The displayed value `-0.000761%` suggests the raw value is `-0.00076143170637`.
Looking at the data: `-0.00076143170637` - this looks like it's already been multiplied by 100 once (from OKX).
Actually wait - OKX returns raw rate like `-0.0000076143170637`, multiply by 100 = `-0.00076143170637`. That's the value stored.
The frontend then displays it as `-0.000761%` which is actually `-0.000761%` = `-0.0761 bps`.
Normal funding rate is around 0.01% (1 bps). So `-0.000761%` seems way too small.

Actually: OKX fundingRate is already in decimal form like `0.0001` meaning 0.01%. 
If we multiply by 100, we get `0.01` which should display as `0.01%`. 
But the stored value is `-0.00076143170637` which means the raw OKX value was `-0.0000076143170637` - that's extremely small.
OR: the raw value was `-0.00076143170637` and it was NOT multiplied by 100 (Binance failed, OKX returned this).
OKX funding rate for BTC-USDT-SWAP is typically around 0.0001 (= 0.01%).
A value of -0.00076 would mean -0.076% which is unusual but possible in a crash.

The frontend formatting issue: the value is stored as a decimal (e.g., -0.00076) and displayed with `%` suffix.
If the value is already multiplied by 100, then -0.00076 means -0.00076%. That's wrong.
If the value is NOT multiplied by 100, then -0.00076 = -0.076% which is more reasonable.

Need to check: did Binance fail (HTTP 451) and OKX return the value? OKX returns raw decimal, then * 100 = percentage.
So if OKX returned -0.0000076, * 100 = -0.00076. That's -0.00076% which is tiny.
But if OKX returned -0.00076, * 100 = -0.076. That's -0.076% which is more normal.

The issue is the `* 100` conversion. Need to verify what OKX actually returns.

## Issue 4: ETF data
ETF data looks correct: -27.5M total, IBIT -32.7M, FBTC 0, GBTC 0. 30 days of data.
The 5D rolling avg is +157.5M, 20D rolling avg is -35.8M. This seems reasonable.
